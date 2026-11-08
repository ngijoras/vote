/* ============================================================
   E-VOTE • voice.js (FULL FIX - FINAL + ON/OFF TOGGLE)
   Text-to-Speech Bahasa Indonesia + Auto-Unlock + Queue.
   ============================================================ */
window.Voice = (function () {
  'use strict';

  const synth = (typeof window !== 'undefined' && window.speechSynthesis) || null;
  const Utter = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) || null;
  const supported = !!(synth && Utter);

  const config = {
    lang: 'id-ID',
    rate: 0.95,
    pitch: 1.05,
    volume: 1.0,
    dedupMs: 1500, // Cegah suara dobel dalam waktu berdekatan
    safetyGraceMs: 5000,
  };

  /* ============================================================
   *  ON/OFF STATE (Persistent)
   *  ============================================================ */
  let isVoiceEnabled = true;
  try {
    const Store = (window.SafeStorage || localStorage);
    const saved = Store.getItem('evote_voice_enabled');
    if (saved === 'false') isVoiceEnabled = false;
  } catch (_) {}

  function toggle() {
    isVoiceEnabled = !isVoiceEnabled;
    try {
      const Store = (window.SafeStorage || localStorage);
      Store.setItem('evote_voice_enabled', isVoiceEnabled);
    } catch (_) {}

    if (!isVoiceEnabled) stop(); // Langsung matikan jika di-off
    
    if (window.UI && UI.toast) {
      UI.toast('Suara ' + (isVoiceEnabled ? 'Dinyalakan' : 'Dimatikan'), isVoiceEnabled ? 'success' : 'info');
    }
    return isVoiceEnabled;
  }

  function isEnabled() { return isVoiceEnabled; }

  /* ============================================================
   *  VOICE PICKER
   *  ============================================================ */
  let preferredVoice = null;
  let voicesReady    = false;

  function pickVoice() {
    if (!supported) return;
    let voices = [];
    try { voices = synth.getVoices() || []; } catch (_) { voices = []; }
    if (!voices.length) return;

    // Urutan prioritas: ID Female -> ID Default -> ID apapun -> MY (Melayu) -> Default
    preferredVoice =
      voices.find(v => v.lang === 'id-ID' && /female|wanita|perempuan|damayanti|gadis/i.test(v.name)) ||
      voices.find(v => v.lang === 'id-ID') ||
      voices.find(v => v.lang === 'id_ID') ||
      voices.find(v => /^id[-_]?/i.test(v.lang)) ||
      voices.find(v => /indonesia|bahasa/i.test(v.name)) ||
      voices.find(v => /^ms|^msa/i.test(v.lang)) || 
      voices[0] || null;

    voicesReady = true;
  }

  /* ============================================================
   *  AUTO-UNLOCK (Penting untuk Browser Mobile)
   *  ============================================================ */
  function unlockAudio() {
    if (!supported) return;
    try {
      // Ucapkan spasi kosong untuk membangunkan mesin TTS
      const u = new Utter(' ');
      u.volume = 0;
      synth.speak(u);
    } catch (_) {}
    // Hapus listener setelah sukses
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('touchstart', unlockAudio);
  }

  try {
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
  } catch (_) {}

  if (supported) {
    pickVoice();

    try {
      if (typeof synth.onvoiceschanged !== 'undefined') {
        synth.onvoiceschanged = pickVoice;
      }
      if (synth.addEventListener) {
        synth.addEventListener('voiceschanged', pickVoice);
      }
    } catch (_) {}

    let attempts = 0;
    const poll = setInterval(() => {
      if (voicesReady || attempts++ > 20) { clearInterval(poll); return; }
      pickVoice();
    }, 250);
  }

  /* ============================================================
   *  QUEUE & SPEAK LOGIC
   *  ============================================================ */
  let queue          = [];
  let safetyTimer    = null;
  let lastText       = '';
  let lastTextTime   = 0;
  let speakingNow    = false;

  function speak(text) {
    if (!isVoiceEnabled) return; // ✅ Blokir jika user mematikan suara
    if (!supported) {
      console.warn('[Voice] speechSynthesis tidak didukung browser ini.');
      return;
    }

    text = String(text == null ? '' : text).trim();
    if (!text) return;

    // Cegah suara ganda dalam waktu berdekatan
    const now = Date.now();
    if (text === lastText && (now - lastTextTime) < config.dedupMs) return;
    lastText = text;
    lastTextTime = now;

    try {
      if (synth.speaking || synth.pending) {
        queue.push(text);
        return;
      }
    } catch (_) {}

    doSpeak(text);
  }

  function doSpeak(text) {
    let utt;
    try {
      utt = new Utter(text);
    } catch (e) {
      console.warn('[Voice] gagal buat utterance:', e);
      speakingNow = false;
      processQueue();
      return;
    }

    utt.lang   = config.lang;
    utt.rate   = config.rate;
    utt.pitch  = config.pitch;
    utt.volume = config.volume;
    if (preferredVoice) utt.voice = preferredVoice;

    const cleanupTimer = () => {
      if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    };

    utt.onend = () => {
      cleanupTimer();
      speakingNow = false;
      processQueue();
    };

    utt.onerror = (e) => {
      cleanupTimer();
      speakingNow = false;
      const err = e && e.error;
      if (err !== 'interrupted' && err !== 'canceled' && err !== 'cancel') {
        console.warn('[Voice] utterance error:', err || e);
      }
      processQueue();
    };

    speakingNow = true;

    try {
      synth.speak(utt);
    } catch (e) {
      console.warn('[Voice] synth.speak error:', e);
      speakingNow = false;
      processQueue();
      return;
    }

    // Safety timeout agar tidak "nyangkut" di Chrome
    const estimated = 800 + text.length * 90 + config.safetyGraceMs;
    safetyTimer = setTimeout(() => {
      console.warn('[Voice] safety timeout — forcing next');
      try { synth.cancel(); } catch (_) {}
      speakingNow = false;
      setTimeout(processQueue, 150);
    }, estimated);
  }

  function processQueue() {
    if (!supported) return;
    if (queue.length === 0) return;

    try {
      if (synth.speaking || synth.pending) return;
    } catch (_) {}

    const next = queue.shift();
    if (next) doSpeak(next);
  }

  /* ============================================================
   *  STOP & CONFIG
   *  ============================================================ */
  function stop() {
    if (!supported) return;
    queue = [];
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    speakingNow = false;
    try { synth.cancel(); } catch (_) {}
  }

  function setConfig(partial) {
    if (!partial || typeof partial !== 'object') return;
    Object.keys(partial).forEach(k => {
      if (k in config) config[k] = partial[k];
    });
    if ('lang' in partial) {
      voicesReady = false;
      pickVoice();
    }
  }

  /* ============================================================
   *  PRESET ANNOUNCEMENTS
   *  ============================================================ */
  function announceCheckin(name, booth) {
    if (!name) return;
    if (booth) {
      speak('Pemilih dengan nama ' + name + ', silakan menuju ' + booth + '.');
    } else {
      speak('Pemilih dengan nama ' + name + ', silakan duduk di kursi tunggu. Bilik masih penuh.');
    }
  }

  function announceBoothFree(booth, waitingName) {
    if (!booth) return;
    if (waitingName) {
      speak('Bilik ' + booth + ' telah kosong. ' + waitingName + ', silakan menuju bilik ' + booth + '.');
    } else {
      speak('Bilik ' + booth + ' telah kosong.');
    }
  }

  /* ============================================================
   *  EXPORT
   *  ============================================================ */
  return {
    speak: speak,
    stop: stop,
    toggle: toggle,
    isEnabled: isEnabled,
    setConfig: setConfig,
    announceCheckin: announceCheckin,
    announceBoothFree: announceBoothFree,
    isSupported: () => supported,
    hasVoice: () => !!preferredVoice,
    isSpeaking: () => {
      if (!supported) return false;
      try { return speakingNow || synth.speaking || synth.pending; }
      catch (_) { return speakingNow; }
    },
    getQueueLength: () => queue.length,
    _getVoices: () => (supported ? (synth.getVoices() || []) : []),
    _getPreferred: () => preferredVoice,
    _config: config,
  };
})();