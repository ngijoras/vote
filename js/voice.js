/* ============================================================
   E-VOTE • voice.js
   Text-to-Speech Bahasa Indonesia.
   API: Voice.speak(text) • Voice.stop() • Voice.setConfig({...})
        Voice.announceCheckin(name, booth) — kompat
        Voice.announceBoothFree(booth, waitingName) — kompat
        Voice.isSupported() • Voice.hasVoice() • Voice.isSpeaking()

   Fitur:
   - Auto-detect voice Indonesia (prioritas id-ID female → id-ID → id-* → default)
   - Re-pick saat 'voiceschanged' (Chrome load async)
   - Queue utterance — tidak ada nama hilang saat check-in beruntun
   - Dedup window (default 1.5 dtk) — cegah polling dobel
   - Safety timeout — mitigasi bug Chrome yang membuat speaking "nyangkut"
   - Tidak pernah throw — semua path dibungkus try/catch
   ============================================================ */
window.Voice = (function () {
  'use strict';

  const synth = (typeof window !== 'undefined' && window.speechSynthesis) || null;
  const Utter = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) || null;
  const supported = !!(synth && Utter);

  /* ---------- Config ---------- */
  const config = {
    lang: 'id-ID',
    rate: 0.95,
    pitch: 1.05,
    volume: 1.0,
    dedupMs: 1500,       // abaikan teks identik dalam window ini
    safetyGraceMs: 5000, // buffer tambahan di atas estimasi durasi
  };

  /* ---------- State ---------- */
  let preferredVoice = null;
  let voicesReady    = false;
  let queue          = [];
  let safetyTimer    = null;
  let lastText       = '';
  let lastTextTime   = 0;
  let speakingNow    = false;

  /* ============================================================
   *  VOICE PICKER
   * ============================================================ */
  function pickVoice() {
    if (!supported) return;
    let voices = [];
    try { voices = synth.getVoices() || []; } catch (_) { voices = []; }
    if (!voices.length) return;

    // Priority
    preferredVoice =
      voices.find(v => v.lang === 'id-ID' && /female|wanita|perempuan|damayanti|gadis/i.test(v.name)) ||
      voices.find(v => v.lang === 'id-ID') ||
      voices.find(v => v.lang === 'id_ID') ||
      voices.find(v => /^id[-_]?/i.test(v.lang)) ||
      voices.find(v => /indonesia|bahasa/i.test(v.name)) ||
      voices.find(v => /^ms|^msa/i.test(v.lang)) || // Melayu, fallback
      voices[0] || null;

    voicesReady = true;
  }

  if (supported) {
    // Initial attempt
    pickVoice();

    // 'voiceschanged' listener (standard)
    try {
      if (typeof synth.onvoiceschanged !== 'undefined') {
        synth.onvoiceschanged = pickVoice;
      }
      // Double-bind via addEventListener too (some browsers)
      if (synth.addEventListener) {
        synth.addEventListener('voiceschanged', pickVoice);
      }
    } catch (_) {}

    // Poll briefly — some browsers populate voices lazily
    let attempts = 0;
    const poll = setInterval(() => {
      if (voicesReady || attempts++ > 20) { clearInterval(poll); return; }
      pickVoice();
    }, 250);
  }

  /* ============================================================
   *  SPEAK
   * ============================================================ */
  function speak(text) {
    if (!supported) {
      console.warn('[Voice] speechSynthesis tidak didukung browser ini.');
      return;
    }

    text = String(text == null ? '' : text).trim();
    if (!text) return;

    // Dedup — skip repeated identical text in short window
    const now = Date.now();
    if (text === lastText && (now - lastTextTime) < config.dedupMs) return;
    lastText = text;
    lastTextTime = now;

    // If already speaking → queue
    try {
      if (synth.speaking || synth.pending) {
        queue.push(text);
        return;
      }
    } catch (_) {
      // ignore
    }

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
      // 'interrupted' / 'canceled' = normal (we cancelled)
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

    // Safety: kalau utterance tidak pernah onend (Chrome bug), paksa lanjut
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

    // Cek apakah synth benar-benar idle
    try {
      if (synth.speaking || synth.pending) return;
    } catch (_) {}

    const next = queue.shift();
    if (next) doSpeak(next);
  }

  /* ============================================================
   *  STOP
   * ============================================================ */
  function stop() {
    if (!supported) return;
    queue = [];
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
    speakingNow = false;
    try { synth.cancel(); } catch (_) {}
  }

  /* ============================================================
   *  CONFIG
   * ============================================================ */
  function setConfig(partial) {
    if (!partial || typeof partial !== 'object') return;
    Object.keys(partial).forEach(k => {
      if (k in config) config[k] = partial[k];
    });
    // Kalau language berubah, re-pick voice
    if ('lang' in partial) {
      voicesReady = false;
      pickVoice();
    }
  }

  /* ============================================================
   *  PRESET ANNOUNCEMENTS (backward compat)
   * ============================================================ */
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
   * ============================================================ */
  return {
    /* Core */
    speak: speak,
    stop: stop,
    setConfig: setConfig,

    /* Compat */
    announceCheckin: announceCheckin,
    announceBoothFree: announceBoothFree,

    /* Info */
    isSupported: () => supported,
    hasVoice: () => !!preferredVoice,
    isSpeaking: () => {
      if (!supported) return false;
      try { return speakingNow || synth.speaking || synth.pending; }
      catch (_) { return speakingNow; }
    },
    getQueueLength: () => queue.length,

    /* Debug */
    _getVoices: () => (supported ? (synth.getVoices() || []) : []),
    _getPreferred: () => preferredVoice,
    _config: config,
  };
})();