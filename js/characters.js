/**
 * Morning Submission Buddy - Character & Rarity Manager
 * 5段階のレアリティ確率(①35%, ②25%, ③20%, ④15%, ⑤5%)
 * 各枠に最大10種類のキャラクター画像を登録・維持可能
 * レベルアップ解禁キャラ枠（各レベル最大5体まで・各キャラごとのレアリティ設定対応）
 * 同一児童内での重複キャラクター画像選出回避機能付き
 * IndexedDB + LocalStorage による大容量・画像ファイルサイズ無制限の永続保存
 */

// デフォルトキャラクターイラスト (SVG Data URL)
const DEFAULT_SVG_CHARS = {
  bear: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="55" r="35" fill="%23FFB74D"/><circle cx="25" cy="25" r="15" fill="%23FFB74D"/><circle cx="75" cy="25" r="15" fill="%23FFB74D"/><circle cx="25" cy="25" r="8" fill="%23FFE0B2"/><circle cx="75" cy="25" r="8" fill="%23FFE0B2"/><ellipse cx="50" cy="65" rx="15" ry="10" fill="%23FFF3E0"/><circle cx="40" cy="48" r="4" fill="%233E2723"/><circle cx="60" cy="48" r="4" fill="%233E2723"/><ellipse cx="50" cy="60" rx="6" ry="4" fill="%233E2723"/><path d="M44 64 Q50 68 56 64" stroke="%233E2723" stroke-width="2" fill="none"/></svg>`,
  cat: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M20 20 L40 40 L15 50 Z" fill="%23FF8A65"/><path d="M80 20 L60 40 L85 50 Z" fill="%23FF8A65"/><circle cx="50" cy="55" r="35" fill="%23FF8A65"/><ellipse cx="50" cy="65" rx="12" ry="8" fill="%23FFCCBC"/><circle cx="38" cy="48" r="5" fill="%23263238"/><circle cx="62" cy="48" r="5" fill="%23263238"/><circle cx="40" cy="46" r="2" fill="%23FFFFFF"/><circle cx="64" cy="46" r="2" fill="%23FFFFFF"/><polygon points="50,58 46,55 54,55" fill="%23D81B60"/><path d="M42 62 Q50 66 58 62" stroke="%23263238" stroke-width="2" fill="none"/></svg>`,
  rabbit: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><ellipse cx="35" cy="30" rx="10" ry="25" fill="%23F48FB1"/><ellipse cx="65" cy="30" rx="10" ry="25" fill="%23F48FB1"/><ellipse cx="35" cy="30" rx="5" ry="16" fill="%23F8BBD0"/><ellipse cx="65" cy="30" rx="5" ry="16" fill="%23F8BBD0"/><circle cx="50" cy="60" r="30" fill="%23F48FB1"/><circle cx="38" cy="55" r="4" fill="%23880E4F"/><circle cx="62" cy="55" r="4" fill="%23880E4F"/><ellipse cx="50" cy="66" rx="8" ry="5" fill="%23FFFFFF"/><polygon points="50,64 47,62 53,62" fill="%23AD1457"/></svg>`,
  robot: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="25" width="60" height="55" rx="12" fill="%234DD0E1"/><circle cx="50" cy="15" r="6" fill="%23FF5252"/><line x1="50" y1="15" x2="50" y2="25" stroke="%2337474F" stroke-width="4"/><rect x="30" y="40" width="15" height="15" rx="4" fill="%23E0F7FA"/><rect x="55" y="40" width="15" height="15" rx="4" fill="%23E0F7FA"/><circle cx="37.5" cy="47.5" r="4" fill="%2300ACC1"/><circle cx="62.5" cy="47.5" r="4" fill="%2300ACC1"/><rect x="35" y="64" width="30" height="8" rx="4" fill="%2337474F"/></svg>`,
  star: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 64,34 96,39 73,61 78,93 50,78 22,93 27,61 4,39 36,34" fill="%23FFD54F" stroke="%23FFA000" stroke-width="3"/><circle cx="38" cy="45" r="4" fill="%235D4037"/><circle cx="62" cy="45" r="4" fill="%235D4037"/><path d="M42 58 Q50 65 58 58" stroke="%235D4037" stroke-width="3" fill="none"/></svg>`,
  crown: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M15 80 L85 80 L90 30 L68 55 L50 20 L32 55 L10 30 Z" fill="%23FFD700" stroke="%23FF8C00" stroke-width="3"/><circle cx="50" cy="20" r="5" fill="%23E91E63"/><circle cx="10" cy="30" r="5" fill="%2300BCD4"/><circle cx="90" cy="30" r="5" fill="%2300BCD4"/><circle cx="38" cy="65" r="4" fill="%233E2723"/><circle cx="62" cy="65" r="4" fill="%233E2723"/><path d="M44 72 Q50 77 56 72" stroke="%233E2723" stroke-width="3" fill="none"/></svg>`
};

class CharacterManager {
  constructor() {
    this.STORAGE_KEY = 'morning_submission_custom_chars_stable';
    
    // レアリティ枠定義 (5段階：計100%)
    this.rarities = [
      { id: 0, name: 'ノーマル 1', chance: 0.35, key: 'common1', badge: '枠① (35%)', effectClass: 'effect-common' },
      { id: 1, name: 'ノーマル 2', chance: 0.25, key: 'common2', badge: '枠② (25%)', effectClass: 'effect-common' },
      { id: 2, name: 'レア', chance: 0.20, key: 'rare', badge: '枠③ (20%)', effectClass: 'effect-rare' },
      { id: 3, name: 'Sレア', chance: 0.15, key: 'srare', badge: '枠④ (15%)', effectClass: 'effect-srare' },
      { id: 4, name: 'SSレア / UR', chance: 0.05, key: 'ssrare', badge: '枠⑤ (5%)', effectClass: 'effect-ssrare' }
    ];

    // デフォルトキャラプール（各枠最大10個）
    this.defaultPools = {
      common1: [
        { name: 'くまさん', image: DEFAULT_SVG_CHARS.bear, praise: 'OK！' },
        { name: 'ねこちゃん', image: DEFAULT_SVG_CHARS.cat, praise: 'やったね！' }
      ],
      common2: [
        { name: 'うさぎさん', image: DEFAULT_SVG_CHARS.rabbit, praise: 'グッジョブ！' },
        { name: 'ロボットくん', image: DEFAULT_SVG_CHARS.robot, praise: 'ばっちり！' }
      ],
      rare: [
        { name: 'キラキラ星', image: DEFAULT_SVG_CHARS.star, praise: 'すごーい！' }
      ],
      srare: [
        { name: '王様', image: DEFAULT_SVG_CHARS.crown, praise: 'たいへんよくできました！' }
      ],
      ssrare: [
        { name: '黄金の王冠', image: DEFAULT_SVG_CHARS.crown, praise: '🌟 超レジェンド！！ 🌟' },
        { name: '虹のスター', image: DEFAULT_SVG_CHARS.star, praise: '✨ 大あたりー！ ✨' }
      ]
    };

    // レベルアップ解放キャラクター（各レベル最大5体まで）
    this.levelRewardPools = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: []
    };

    this.pools = JSON.parse(JSON.stringify(this.defaultPools));
    this.loadCustomChars();
  }

  // データの読み込み (IndexedDB & LocalStorage対応)
  async loadCustomChars() {
    try {
      let parsed = null;
      if (window.appStorage) {
        parsed = await window.appStorage.getItem(this.STORAGE_KEY);
      }

      if (!parsed) {
        const keys = [
          this.STORAGE_KEY,
          'morning_submission_custom_chars_v3',
          'morning_submission_custom_chars_v2',
          'morning_submission_custom_chars_v1'
        ];
        for (const k of keys) {
          const item = localStorage.getItem(k);
          if (item) {
            try { parsed = JSON.parse(item); break; } catch {}
          }
        }
      }

      if (parsed) {
        this.rarities.forEach(r => {
          if (parsed.pools && parsed.pools[r.key] && Array.isArray(parsed.pools[r.key])) {
            this.pools[r.key] = parsed.pools[r.key].slice(0, 10);
          } else if (parsed[r.key] && Array.isArray(parsed[r.key])) {
            this.pools[r.key] = parsed[r.key].slice(0, 10);
          }
        });

        if (parsed.levelRewardPools) {
          for (let lvl = 1; lvl <= 5; lvl++) {
            if (parsed.levelRewardPools[lvl] && Array.isArray(parsed.levelRewardPools[lvl])) {
              this.levelRewardPools[lvl] = parsed.levelRewardPools[lvl].slice(0, 5).map(c => ({
                name: c.name || `Lv.${lvl}キャラ`,
                image: c.image,
                praise: c.praise || 'OK！',
                rarityKey: c.rarityKey || 'rare' // デフォルトレアリティ
              }));
            }
          }
        }
      }
    } catch (e) {
      console.warn('Custom characters load error:', e);
    }
  }

  // カスタムキャラの保存（永続維持）
  async saveCustomChars() {
    try {
      const payload = {
        pools: this.pools,
        levelRewardPools: this.levelRewardPools
      };

      if (window.appStorage) {
        await window.appStorage.setItem(this.STORAGE_KEY, payload);
      } else {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
      }
      return true;
    } catch (e) {
      console.error('Custom characters save error:', e);
      return false;
    }
  }

  // 枠に基本キャラクターを追加（最大10個）
  addCharacter(rarityKey, charObj) {
    if (!this.pools[rarityKey]) this.pools[rarityKey] = [];
    if (this.pools[rarityKey].length >= 10) {
      alert('このレアリティ枠には最大10個までしか登録できません。');
      return false;
    }
    this.pools[rarityKey].push(charObj);
    this.saveCustomChars();
    return true;
  }

  // レベルアップ解放枠にキャラクターを追加（各レベル最大5個、指定レアリティ付き）
  addLevelRewardCharacter(level, charObj) {
    if (!this.levelRewardPools[level]) this.levelRewardPools[level] = [];
    if (this.levelRewardPools[level].length >= 5) {
      alert(`レベル ${level} の解放枠には最大5個までしか登録できません。`);
      return false;
    }
    if (!charObj.rarityKey) charObj.rarityKey = 'rare';
    this.levelRewardPools[level].push(charObj);
    this.saveCustomChars();
    return true;
  }

  // レベルアップ解放キャラクターのレアリティ更新
  updateLevelRewardCharacterRarity(level, index, newRarityKey) {
    if (this.levelRewardPools[level] && this.levelRewardPools[level][index]) {
      this.levelRewardPools[level][index].rarityKey = newRarityKey;
      this.saveCustomChars();
      return true;
    }
    return false;
  }

  // レベルアップ解放キャラクターの削除
  removeLevelRewardCharacter(level, index) {
    if (this.levelRewardPools[level] && this.levelRewardPools[level][index]) {
      this.levelRewardPools[level].splice(index, 1);
      this.saveCustomChars();
      return true;
    }
    return false;
  }

  // 基本キャラクターの削除
  removeCharacter(rarityKey, index) {
    if (this.pools[rarityKey] && this.pools[rarityKey][index]) {
      this.pools[rarityKey].splice(index, 1);
      this.saveCustomChars();
      return true;
    }
    return false;
  }

  // デフォルトに戻す
  resetToDefault() {
    this.pools = JSON.parse(JSON.stringify(this.defaultPools));
    this.levelRewardPools = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    this.saveCustomChars();
  }

  /**
   * 全キャラクターをレアリティ別・No.付きでまとめたマスターリストを返す
   * 順番: 各レアリティ内で「基本プール」→「レベル解禁プール（Lv昇順）」
   * @returns {{ rarityKey:string, rarityObj:object, no:number, name:string, image:string, praise:string, source:string }[]}
   */
  getCharMasterList() {
    const result = [];
    this.rarities.forEach(rarity => {
      let no = 1;
      // 基本プール
      (this.pools[rarity.key] || []).forEach(char => {
        result.push({
          rarityKey: rarity.key,
          rarityObj: rarity,
          no: no++,
          name: char.name,
          image: char.image,
          praise: char.praise,
          source: 'basic'
        });
      });
      // レベル解禁プール（Lv.1〜5の昇順、同一レアリティのもの）
      for (let lvl = 1; lvl <= 5; lvl++) {
        (this.levelRewardPools[lvl] || [])
          .filter(c => (c.rarityKey || 'rare') === rarity.key)
          .forEach(char => {
            result.push({
              rarityKey: rarity.key,
              rarityObj: rarity,
              no: no++,
              name: char.name,
              image: char.image,
              praise: char.praise,
              source: `lv${lvl}`
            });
          });
      }
    });
    return result;
  }

  /**
   * 画像URLでマスターリストを検索してNo.を返す（見つからない場合は null）
   * @param {string} imageUrl
   * @returns {{ rarityKey:string, no:number }|null}
   */
  getCharNo(imageUrl) {
    const master = this.getCharMasterList();
    const found = master.find(c => c.image === imageUrl);
    return found ? { rarityKey: found.rarityKey, no: found.no } : null;
  }

  // ガチャ抽選ロジック（基本確率でレアリティ枠を抽選後、同じレアリティに設定された解禁キャラも含めて選出）
  roll(usedCharImages = [], currentLevel = 0) {
    const rand = Math.random(); // 0 ~ 1.0
    let cumulative = 0;
    let selectedRarity = this.rarities[0];

    // 1. 確率テーブルに基づきレアリティ枠（①35%, ②25%, ③20%, ④15%, ⑤5%）を抽選
    for (let i = 0; i < this.rarities.length; i++) {
      cumulative += this.rarities[i].chance;
      if (rand <= cumulative) {
        selectedRarity = this.rarities[i];
        break;
      }
    }

    // 2. 該当レアリティの基本プールを取得
    let pool = [...(this.pools[selectedRarity.key] || [])];

    // 3. 到達しているクラスレベルまでの解禁キャラのうち、このレアリティに設定されたキャラを合流
    for (let lvl = 1; lvl <= Math.min(currentLevel, 5); lvl++) {
      if (this.levelRewardPools[lvl] && this.levelRewardPools[lvl].length > 0) {
        const matchedLevelChars = this.levelRewardPools[lvl].filter(c => (c.rarityKey || 'rare') === selectedRarity.key);
        pool.push(...matchedLevelChars);
      }
    }

    let charItem;

    if (pool.length > 0) {
      // まだ同一児童内で使われていないキャラ画像を優先抽出
      const unusedPool = pool.filter(c => !usedCharImages.includes(c.image));
      if (unusedPool.length > 0) {
        const charIndex = Math.floor(Math.random() * unusedPool.length);
        charItem = unusedPool[charIndex];
      } else {
        const charIndex = Math.floor(Math.random() * pool.length);
        charItem = pool[charIndex];
      }
    } else {
      // 万一プールが空の場合はフォールバック
      charItem = { name: 'スター', image: DEFAULT_SVG_CHARS.star, praise: 'OK！' };
    }

    return {
      rarity: selectedRarity,
      character: charItem
    };
  }
}

window.characterManager = new CharacterManager();
