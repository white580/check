/**
 * Morning Submission Buddy - Sound Engine (Web Audio API)
 * 外部音声ファイルに依存せず、軽量で確実なポップ音・レア音・ファンファーレを合成出力
 */

class SoundEngine {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
  }

  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggleSound(enable) {
    this.enabled = enable !== undefined ? enable : !this.enabled;
    return this.enabled;
  }

  // タッチ基本音 (ポップ音)
  playPop() {
    if (!this.enabled) return;
    this.init();
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.audioCtx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.08);
  }

  // キャンセル/解除音 (ポコン)
  playCancel() {
    if (!this.enabled) return;
    this.init();
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(250, this.audioCtx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.1);
  }

  // 「ぜんぶOK」一括達成音 (シャキーン＋キラキラ)
  playAllOk() {
    if (!this.enabled) return;
    this.init();
    if (!this.audioCtx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime + idx * 0.05);

      gain.gain.setValueAtTime(0, this.audioCtx.currentTime + idx * 0.05);
      gain.gain.linearRampToValueAtTime(0.2, this.audioCtx.currentTime + idx * 0.05 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + idx * 0.05 + 0.25);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(this.audioCtx.currentTime + idx * 0.05);
      osc.stop(this.audioCtx.currentTime + idx * 0.05 + 0.25);
    });
  }

  // レア度に応じたエフェクト音
  playRaritySound(rarityIndex) {
    if (!this.enabled) return;
    this.init();
    if (!this.audioCtx) return;

    // rarityIndex: 0(40%), 1(30%), 2(20%), 3(9%), 4(0.9%), 5(0.1%)
    if (rarityIndex <= 1) {
      this.playPop();
    } else if (rarityIndex === 2) { // Rare (20%)
      this.playArpeggio([587.33, 739.99, 880], 'sine', 0.06); // D5, F#5, A5
    } else if (rarityIndex === 3) { // SRare (9%)
      this.playArpeggio([659.25, 830.61, 987.77, 1318.51], 'triangle', 0.06); // E Major
    } else if (rarityIndex === 4) { // SSRare (0.9%)
      this.playFanfareShort();
    } else if (rarityIndex === 5) { // UR (0.1%)
      this.playUltraFanfare();
    }
  }

  playArpeggio(notes, type, stepTime) {
    notes.forEach((freq, i) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime + i * stepTime);

      gain.gain.setValueAtTime(0.25, this.audioCtx.currentTime + i * stepTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + i * stepTime + 0.3);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(this.audioCtx.currentTime + i * stepTime);
      osc.stop(this.audioCtx.currentTime + i * stepTime + 0.3);
    });
  }

  // SSレア用短いファンファーレ
  playFanfareShort() {
    const notes = [
      { f: 523.25, d: 0.1, t: 0 },
      { f: 659.25, d: 0.1, t: 0.1 },
      { f: 783.99, d: 0.1, t: 0.2 },
      { f: 1046.50, d: 0.3, t: 0.3 }
    ];
    notes.forEach(n => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, this.audioCtx.currentTime + n.t);
      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime + n.t);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + n.t + n.d);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(this.audioCtx.currentTime + n.t);
      osc.stop(this.audioCtx.currentTime + n.t + n.d);
    });
  }

  // UR激レア用 豪華特大ファンファーレ！
  playUltraFanfare() {
    const melody = [
      { f: 523.25, d: 0.1, t: 0 },
      { f: 523.25, d: 0.1, t: 0.12 },
      { f: 523.25, d: 0.1, t: 0.24 },
      { f: 659.25, d: 0.2, t: 0.36 },
      { f: 783.99, d: 0.2, t: 0.56 },
      { f: 1046.50, d: 0.5, t: 0.76 }
    ];
    melody.forEach(n => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, this.audioCtx.currentTime + n.t);
      gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime + n.t);
      gain.gain.exponentialRampToValueAtTime(0.005, this.audioCtx.currentTime + n.t + n.d);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(this.audioCtx.currentTime + n.t);
      osc.stop(this.audioCtx.currentTime + n.t + n.d);
    });
  }
}

window.soundEngine = new SoundEngine();
