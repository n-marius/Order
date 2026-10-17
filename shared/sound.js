// Kurze, synthetische Signaltöne (keine Audiodateien nötig).
// iOS gibt Audio erst nach einer Berührung frei – unlockAudio() beim ersten Tippen aufrufen.

let ctx;
function ac() {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export function unlockAudio() {
  const once = () => {
    try {
      const c = ac();
      if (c.state === 'suspended') c.resume();
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch {}
    removeEventListener('pointerdown', once, true);
  };
  addEventListener('pointerdown', once, true);
}

function tone(c, freq, start, dur, gain = 0.18) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

/** kind: 'order' (neue Bestellung), 'alert' (Storno/Nachfrage), 'soft' (Info) */
export function chime(kind = 'order') {
  try {
    const c = ac();
    if (c.state === 'suspended') c.resume();
    const t = c.currentTime + 0.02;
    if (kind === 'order') { tone(c, 880, t, 0.5); tone(c, 1318.5, t + 0.16, 0.7); }
    else if (kind === 'alert') { tone(c, 659.3, t, 0.35, 0.2); tone(c, 523.3, t + 0.2, 0.5, 0.2); }
    else tone(c, 1046.5, t, 0.35, 0.12);
  } catch {}
}
