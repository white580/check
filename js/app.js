/**
 * Morning Submission Buddy - Main Application Logic
 * 16:9横画面フィット（ノー・スクロール）設計＆自動サイズ調整
 * ★「次の日へ」押し時の自動提出保存＆過去さかのぼり参照機能
 * ★キャラクター設定・児童名簿の永続保存（IndexedDB + LocalStorage）
 * ★画像ファイルサイズ無制限の追加・高速最適化
 * ★同一児童内での重複キャラクター画像選出回避機能付き
 * ★クラスレベル＆経験値ゲージ（分数表示、累計保存、自動レベルアップ）機能実装
 * ★レベルアップ解禁キャラクター設定枠（各レベル最大5体）
 */

// 画像ファイルを安全かつ高速にDataURL化・最適化するユーティリティ (ファイルサイズ無制限)
function processImageFile(file, callback) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const rawDataUrl = e.target.result;
    const img = new Image();
    
    img.onload = () => {
      // 最大512pxに収まるよう高品質Canvas最適化
      const maxWidth = 512;
      const maxHeight = 512;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const mime = (file.type === 'image/jpeg' || file.type === 'image/jpg') ? 'image/jpeg' : 'image/png';
        const optimized = canvas.toDataURL(mime, 0.92);
        callback(optimized);
      } catch (canvasErr) {
        callback(rawDataUrl);
      }
    };

    img.onerror = () => {
      callback(rawDataUrl);
    };

    img.src = rawDataUrl;
  };

  reader.onerror = () => {
    alert('⚠️ 画像ファイルの読み込みに失敗しました。');
  };

  reader.readAsDataURL(file);
}

// プリセット提出物項目（自学・れんらくちょう・プリント・その他）
const PRESET_SUBMISSION_ITEMS = [
  { id: 'item_jigaku', name: '自学', icon: '✍️' },
  { id: 'item_renraku', name: 'れんらくちょう', icon: '📖' },
  { id: 'item_print', name: 'プリント', icon: '📄' },
  { id: 'item_other', name: 'その他', icon: '📦' }
];

class MorningSubmissionApp {
  constructor() {
    this.STORAGE_KEY_DATA = 'morning_submission_app_data_stable';
    
    // デフォルト児童名簿 (28名)
    this.defaultStudents = Array.from({ length: 28 }, (_, i) => ({
      id: `std_${i + 1}`,
      number: i + 1,
      name: `児童 ${i + 1}`
    }));

    // デフォルト提出物リスト
    this.defaultItems = [
      { id: 'item_jigaku', name: '自学', icon: '✍️' },
      { id: 'item_renraku', name: 'れんらくちょう', icon: '📖' },
      { id: 'item_print', name: 'プリント', icon: '📄' }
    ];

    this.students = [...this.defaultStudents];
    this.items = [...this.defaultItems];
    
    // 日付ごとの提出物設定: { [dateKey]: [ { id, name, icon }, ... ] }
    this.dailyItems = {};

    // 日付別データ構造: { [dateKey]: { [studentId]: { [itemId]: { checked: bool, char: obj } } } }
    this.historyState = {}; 
    this.dailyHistory = {}; // { [dateKey]: { [studentId_itemId]: rollResult } }
    
    // クラスレベル＆経験値データ
    this.levelData = {
      currentLevel: 0,
      currentExpInLevel: 0,
      completedDates: {} // { [dateKey]: bool }
    };

    this.selectedDateKey = this.getTodayKey(); // 現在画面に表示中の運用日付

    this.init();
    this.bindEvents();
    window.addEventListener('resize', () => this.adjustLayout());
  }

  async init() {
    await this.loadState();
    if (window.characterManager) {
      await window.characterManager.loadCustomChars();
    }
    this.initUI();
    this.adjustLayout();
  }

  // 本日の日付キー (YYYY-MM-DD)
  getTodayKey() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 日付ごとの提出物リストを取得（未設定の場合は直近設定またはデフォルトからコピーして保存・維持）
  getItemsForDate(dateKey = this.selectedDateKey) {
    if (this.dailyItems && this.dailyItems[dateKey] && Array.isArray(this.dailyItems[dateKey]) && this.dailyItems[dateKey].length > 0) {
      return this.dailyItems[dateKey];
    }

    // 既存の historyState からその日に使われていた itemId があれば復元
    if (this.historyState[dateKey]) {
      const studentKeys = Object.keys(this.historyState[dateKey]);
      if (studentKeys.length > 0) {
        const itemIds = Object.keys(this.historyState[dateKey][studentKeys[0]] || {});
        if (itemIds.length > 0) {
          const restored = [];
          itemIds.forEach(id => {
            const found = PRESET_SUBMISSION_ITEMS.find(p => p.id === id) || (this.items && this.items.find(it => it.id === id));
            if (found) {
              restored.push({ ...found });
            } else {
              restored.push({ id, name: id.replace('item_', ''), icon: '📝' });
            }
          });
          if (restored.length > 0) {
            this.dailyItems[dateKey] = restored;
            return restored;
          }
        }
      }
    }

    // デフォルト・基本設定からコピーしてその日に固定
    const baseItems = (this.items && this.items.length > 0) ? this.items : this.defaultItems;
    this.dailyItems[dateKey] = JSON.parse(JSON.stringify(baseItems));
    return this.dailyItems[dateKey];
  }

  // 特定日付の提出物リストを設定・保存
  setItemsForDate(dateKey, newItems) {
    if (!newItems || !Array.isArray(newItems) || newItems.length === 0) return false;
    this.dailyItems[dateKey] = JSON.parse(JSON.stringify(newItems));
    this.saveState();
    this.renderGrid();
    this.updateProgress();
    this.updateDailyItemsButtonLabel();
    return true;
  }

  // データ読み込み（IndexedDB + LocalStorage統合）
  async loadState() {
    try {
      let saved = null;
      if (window.appStorage) {
        saved = await window.appStorage.getItem(this.STORAGE_KEY_DATA);
      }

      if (!saved) {
        const keys = [
          this.STORAGE_KEY_DATA,
          'morning_submission_app_data_v5',
          'morning_submission_app_data_v4',
          'morning_submission_app_data_v3',
          'morning_submission_app_data_v2',
          'morning_submission_app_data_v1'
        ];

        for (const k of keys) {
          const item = localStorage.getItem(k);
          if (item) {
            try { saved = JSON.parse(item); break; } catch {}
          }
        }
      }

      if (saved) {
        if (saved.students && Array.isArray(saved.students) && saved.students.length > 0) {
          this.students = saved.students;
        }
        if (saved.items && Array.isArray(saved.items) && saved.items.length > 0) {
          this.items = saved.items;
        }
        if (saved.dailyItems && typeof saved.dailyItems === 'object') {
          this.dailyItems = saved.dailyItems;
        }
        if (saved.historyState) this.historyState = saved.historyState;
        if (saved.dailyHistory) this.dailyHistory = saved.dailyHistory;
        if (saved.selectedDateKey) this.selectedDateKey = saved.selectedDateKey;
        if (saved.levelData) {
          this.levelData = saved.levelData;
          if (!this.levelData.completedDates) this.levelData.completedDates = {};
        }
      }
    } catch (e) {
      console.warn('Load state error:', e);
    }
  }

  // データ保存
  async saveState() {
    try {
      const payload = {
        students: this.students,
        items: this.items,
        dailyItems: this.dailyItems,
        historyState: this.historyState,
        dailyHistory: this.dailyHistory,
        selectedDateKey: this.selectedDateKey,
        levelData: this.levelData
      };

      if (window.appStorage) {
        await window.appStorage.setItem(this.STORAGE_KEY_DATA, payload);
      } else {
        localStorage.setItem(this.STORAGE_KEY_DATA, JSON.stringify(payload));
      }
      return true;
    } catch (e) {
      console.error('Save state error:', e);
      return false;
    }
  }

  // 次のレベルに上がるために必要な全員達成回数（必用経験値）
  getRequiredExpForNextLevel(level) {
    if (level === 0) return 1;
    if (level === 1) return 2;
    if (level === 2) return 3;
    if (level === 3) return 4;
    if (level >= 4) return 5;
    return 5;
  }

  // クラスレベル＆経験値UIの更新（分数表示）
  updateLevelUI() {
    const lvlBadge = document.getElementById('level-badge');
    const fillEl = document.getElementById('exp-gauge-fill');
    const fracText = document.getElementById('exp-fraction-text');

    const level = this.levelData.currentLevel || 0;
    const exp = this.levelData.currentExpInLevel || 0;
    const req = this.getRequiredExpForNextLevel(level);

    if (lvlBadge) lvlBadge.textContent = `👑 Lv.${level}`;
    if (fracText) fracText.textContent = `${exp}/${req}`;
    
    if (fillEl) {
      const pct = Math.min(100, Math.floor((exp / req) * 100));
      fillEl.style.width = `${pct}%`;
    }
  }

  // 指定日付の確定キャラクターを取得 (同児童内で同じキャラ画像の連続選出を回避＆レベル解禁キャラ合流)
  getDailyResult(studentId, itemId, dateKey = this.selectedDateKey) {
    if (!this.dailyHistory[dateKey]) {
      this.dailyHistory[dateKey] = {};
    }

    const key = `${studentId}_${itemId}`;
    if (this.dailyHistory[dateKey][key]) {
      return this.dailyHistory[dateKey][key];
    }

    const currentItems = this.getItemsForDate(dateKey);
    const usedCharImages = [];
    currentItems.forEach(item => {
      const k = `${studentId}_${item.id}`;
      const res = this.dailyHistory[dateKey][k];
      if (res && res.character && res.character.image) {
        usedCharImages.push(res.character.image);
      }
    });

    const rollResult = window.characterManager ? window.characterManager.roll(usedCharImages, this.levelData.currentLevel) : null;
    this.dailyHistory[dateKey][key] = rollResult;
    this.saveState();
    return rollResult;
  }

  // 16:9横画面・スクロールなし動的レイアウト計算
  adjustLayout() {
    const container = document.getElementById('grid-container');
    if (!container) return;

    const count = this.students.length;
    if (count === 0) return;

    let cols = 5;
    if (count <= 12) cols = 4;
    else if (count <= 20) cols = 5;
    else if (count <= 30) cols = 6;
    else if (count <= 42) cols = 7;
    else cols = 8;

    const rows = Math.ceil(count / cols);

    document.documentElement.style.setProperty('--grid-cols', cols);
    document.documentElement.style.setProperty('--grid-rows', rows);

    const availableHeight = window.innerHeight - 115;
    const cardHeight = Math.max(65, Math.floor(availableHeight / rows) - 6);
    document.documentElement.style.setProperty('--card-height', `${cardHeight}px`);

    const fontSize = Math.max(11, Math.min(20, Math.floor(cardHeight * 0.20)));
    document.documentElement.style.setProperty('--dynamic-font-size', `${fontSize}px`);
  }

  initUI() {
    this.renderHeader();
    this.renderGrid();
    this.updateProgress();
    this.updateLevelUI();
    this.updateDailyItemsButtonLabel();
  }

  renderHeader() {
    const dateParts = this.selectedDateKey.split('-');
    let dateStr = '';
    if (dateParts.length === 3) {
      const d = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
      dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${['日','月','火','水','木','金','土'][d.getDay()]})`;
    } else {
      dateStr = this.selectedDateKey;
    }

    const dateEl = document.getElementById('current-date');
    if (dateEl) {
      dateEl.textContent = dateStr;
    }

    this.updateDailyItemsButtonLabel();
  }

  // 日別提出物ボタンのラベル更新
  updateDailyItemsButtonLabel() {
    const btn = document.getElementById('btn-daily-items-toggle');
    if (!btn) return;
    const items = this.getItemsForDate(this.selectedDateKey);
    const names = items.map(it => it.name).join(', ');
    btn.innerHTML = `📝 提出物 (${items.length}項目) ▾`;
    btn.setAttribute('title', `現在(${this.selectedDateKey})の提出物: ${names}\nクリックして変更できます`);
  }

  // 日別提出物選択ポップオーバーの描画
  renderDailyItemsPopover() {
    const popover = document.getElementById('daily-items-popover');
    const dateLabel = document.getElementById('popover-date-label');
    const checklist = document.getElementById('daily-items-checklist');
    if (!popover || !checklist) return;

    // 日付ラベル
    const parts = this.selectedDateKey.split('-');
    if (dateLabel && parts.length === 3) {
      dateLabel.textContent = `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
    }

    const currentItems = this.getItemsForDate(this.selectedDateKey);
    checklist.innerHTML = '';

    // 「自学」「れんらくちょう」「プリント」のプリセット行
    const standardPresets = [
      { id: 'item_jigaku', name: '自学', icon: '✍️' },
      { id: 'item_renraku', name: 'れんらくちょう', icon: '📖' },
      { id: 'item_print', name: 'プリント', icon: '📄' }
    ];

    standardPresets.forEach(preset => {
      const isChecked = currentItems.some(it => it.id === preset.id || it.name === preset.name);
      const row = document.createElement('label');
      row.className = 'daily-item-check-row';
      row.innerHTML = `
        <input type="checkbox" data-id="${preset.id}" data-icon="${preset.icon}" data-name="${preset.name}" ${isChecked ? 'checked' : ''} />
        <span class="daily-item-icon">${preset.icon}</span>
        <span class="daily-item-label">${preset.name}</span>
      `;
      checklist.appendChild(row);
    });

    // 「その他」行（カスタム入力可能）
    const existingOther = currentItems.find(it => it.id === 'item_other' || (!['item_jigaku', 'item_renraku', 'item_print'].includes(it.id) && !['自学', 'れんらくちょう', 'プリント'].includes(it.name)));
    const isOtherChecked = !!existingOther;
    const otherName = existingOther ? existingOther.name : 'その他';

    const otherRow = document.createElement('div');
    otherRow.className = 'daily-item-check-row';
    otherRow.innerHTML = `
      <input type="checkbox" id="check-daily-other" data-id="item_other" data-icon="📦" ${isOtherChecked ? 'checked' : ''} />
      <span class="daily-item-icon">📦</span>
      <input type="text" id="input-daily-other-name" class="daily-item-other-input" value="${otherName}" placeholder="その他 (項目名)" />
    `;
    checklist.appendChild(otherRow);
  }

  // 日別提出物ポップオーバーの開閉
  toggleDailyItemsPopover(forceOpen = null) {
    const popover = document.getElementById('daily-items-popover');
    if (!popover) return;
    const shouldOpen = forceOpen !== null ? forceOpen : (popover.style.display === 'none');
    if (shouldOpen) {
      this.renderDailyItemsPopover();
      popover.style.display = 'block';
    } else {
      popover.style.display = 'none';
    }
  }

  // ポップオーバーからの保存
  saveDailyItemsFromPopover() {
    const checklist = document.getElementById('daily-items-checklist');
    if (!checklist) return;

    const checkboxes = checklist.querySelectorAll('input[type="checkbox"]');
    const selectedItems = [];

    checkboxes.forEach(cb => {
      if (cb.checked) {
        const id = cb.dataset.id;
        const icon = cb.dataset.icon || '📝';
        let name = cb.dataset.name;

        if (id === 'item_other') {
          const nameInput = document.getElementById('input-daily-other-name');
          name = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'その他';
        }

        selectedItems.push({ id, name, icon });
      }
    });

    if (selectedItems.length === 0) {
      alert('⚠️ 提出物項目を少なくとも1つ以上選択してください。');
      return;
    }

    this.setItemsForDate(this.selectedDateKey, selectedItems);
    this.toggleDailyItemsPopover(false);

    if (window.soundEngine) window.soundEngine.playPop();
  }

  // 名簿グリッドの描画
  renderGrid() {
    const container = document.getElementById('grid-container');
    if (!container) return;
    container.innerHTML = '';

    const currentItems = this.getItemsForDate(this.selectedDateKey);

    this.students.forEach(student => {
      const card = document.createElement('div');
      card.className = 'student-card';
      card.id = `card-${student.id}`;

      const headerDiv = document.createElement('div');
      headerDiv.className = 'student-header';
      headerDiv.innerHTML = `
        <span class="student-number">${student.number}</span>
        <span class="student-name">${student.name}</span>
        <button type="button" class="btn-collection" data-student-id="${student.id}" title="${student.name}のコレクションを見る">📚</button>
      `;

      const itemsDiv = document.createElement('div');
      itemsDiv.className = 'item-cells-container';

      const isAllOk = this.isStudentAllOk(student.id);

      currentItems.forEach(item => {
        const cell = document.createElement('button');
        cell.className = 'submission-cell';
        cell.setAttribute('type', 'button');
        cell.setAttribute('title', `${student.name}: ${item.name}`);

        const itemState = this.getItemState(student.id, item.id);

        if (itemState.checked) {
          cell.classList.add('checked');
          const char = itemState.char;
          const rarityClass = char && char.rarity ? char.rarity.effectClass : 'effect-common';
          cell.classList.add(rarityClass);

          const charImg = char && char.character ? char.character.image : '';

          cell.innerHTML = `
            <div class="char-pop-content">
              <img src="${charImg}" alt="char" class="char-img" />
            </div>
          `;
        } else {
          cell.innerHTML = `
            <span class="item-icon">${item.icon}</span>
            <span class="item-label">${item.name}</span>
          `;
        }

        cell.addEventListener('click', (e) => {
          e.preventDefault();
          this.toggleItem(student.id, item.id);
        });

        itemsDiv.appendChild(cell);
      });

      const allOkBtn = document.createElement('button');
      allOkBtn.className = `all-ok-btn ${isAllOk ? 'active' : ''}`;
      allOkBtn.type = 'button';
      allOkBtn.innerHTML = isAllOk ? '✨ ぜんぶOK！' : 'ぜんぶOK';
      allOkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleAllOk(student.id);
      });

      card.appendChild(headerDiv);
      card.appendChild(itemsDiv);
      card.appendChild(allOkBtn);

      container.appendChild(card);
    });

    // コレクションボタンのクリックイベントをまとめて設定
    container.querySelectorAll('.btn-collection').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const studentId = btn.dataset.studentId;
        this.showCollectionModal(studentId);
      });
    });
  }

  getItemState(studentId, itemId, dateKey = this.selectedDateKey) {
    if (this.historyState[dateKey] && this.historyState[dateKey][studentId] && this.historyState[dateKey][studentId][itemId]) {
      return this.historyState[dateKey][studentId][itemId];
    }
    return { checked: false, char: null };
  }

  setItemState(studentId, itemId, checked, char = null, dateKey = this.selectedDateKey) {
    if (!this.historyState[dateKey]) this.historyState[dateKey] = {};
    if (!this.historyState[dateKey][studentId]) this.historyState[dateKey][studentId] = {};
    this.historyState[dateKey][studentId][itemId] = { checked, char };
    this.saveState();
  }

  isStudentAllOk(studentId, dateKey = this.selectedDateKey) {
    const currentItems = this.getItemsForDate(dateKey);
    if (currentItems.length === 0) return false;
    return currentItems.every(item => this.getItemState(studentId, item.id, dateKey).checked);
  }

  // タッチ・トグル動作
  toggleItem(studentId, itemId) {
    const current = this.getItemState(studentId, itemId);
    if (current.checked) {
      this.setItemState(studentId, itemId, false, null);
      if (window.soundEngine) window.soundEngine.playCancel();
    } else {
      const rollResult = this.getDailyResult(studentId, itemId, this.selectedDateKey);
      this.setItemState(studentId, itemId, true, rollResult);

      if (rollResult && window.soundEngine) {
        window.soundEngine.playRaritySound(rollResult.rarity.id);
        if (rollResult.rarity.id >= 4) {
          this.showRareToast(rollResult);
        }
      }
    }

    this.renderGrid();
    this.updateProgress();
    this.checkClassCompletion();
  }

  // 「ぜんぶOK」一括トグル
  toggleAllOk(studentId) {
    const isAllOk = this.isStudentAllOk(studentId);
    const currentItems = this.getItemsForDate(this.selectedDateKey);

    if (isAllOk) {
      currentItems.forEach(item => {
        this.setItemState(studentId, item.id, false, null);
      });
      if (window.soundEngine) window.soundEngine.playCancel();
    } else {
      currentItems.forEach(item => {
        const itemState = this.getItemState(studentId, item.id);
        if (!itemState.checked) {
          const rollResult = this.getDailyResult(studentId, item.id, this.selectedDateKey);
          this.setItemState(studentId, item.id, true, rollResult);
        }
      });
      if (window.soundEngine) window.soundEngine.playAllOk();
    }

    this.renderGrid();
    this.updateProgress();
    this.checkClassCompletion();
  }

  // 進捗バーの更新
  updateProgress() {
    const currentItems = this.getItemsForDate(this.selectedDateKey);
    const totalCount = this.students.length * currentItems.length;
    if (totalCount === 0) return;

    let checkedCount = 0;
    this.students.forEach(std => {
      currentItems.forEach(item => {
        if (this.getItemState(std.id, item.id).checked) {
          checkedCount++;
        }
      });
    });

    const percent = Math.floor((checkedCount / totalCount) * 100);
    const progressBar = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');

    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `全体の提出状況: ${checkedCount} / ${totalCount} (${percent}%)`;
  }

  // クラス全員完了チェック＆経験値加算・レベルアップ新キャラ解放通知ロジック
  checkClassCompletion() {
    const currentItems = this.getItemsForDate(this.selectedDateKey);
    const totalCount = this.students.length * currentItems.length;
    if (totalCount === 0) return;

    let checkedCount = 0;
    this.students.forEach(std => {
      currentItems.forEach(item => {
        if (this.getItemState(std.id, item.id).checked) checkedCount++;
      });
    });

    if (checkedCount === totalCount) {
      setTimeout(() => {
        if (window.confettiManager) window.confettiManager.start(5000);
        if (window.soundEngine) window.soundEngine.playUltraFanfare();

        if (!this.levelData.completedDates) this.levelData.completedDates = {};

        if (!this.levelData.completedDates[this.selectedDateKey]) {
          this.levelData.completedDates[this.selectedDateKey] = true;
          this.levelData.currentExpInLevel += 1;

          const req = this.getRequiredExpForNextLevel(this.levelData.currentLevel);

          if (this.levelData.currentExpInLevel >= req) {
            // レベルアップ！
            this.levelData.currentLevel += 1;
            this.levelData.currentExpInLevel = 0; // 次のレベルへ繰り越し
            
            this.saveState();
            this.updateLevelUI();

            alert(`🎉🎉🎉 レベルアップ！ 🎉🎉🎉\nクラス全員の頑張りで、クラスレベルが 【 Lv.${this.levelData.currentLevel} 】 に上がりました！\n✨ 新しいキャラクターが追加されました！ ✨`);
          } else {
            this.saveState();
            this.updateLevelUI();
            alert(`🎉 すごい！ 本日の提出物がぜんぶ揃いました！ クラスの経験値を 1 ゲット！ 🎉`);
          }
        } else {
          alert(`🎉 すごい！ 本日の提出物がぜんぶ揃いました！ 🎉`);
        }
      }, 300);
    }
  }

  // 超レアキャラクター出現時のトースト
  showRareToast(rollResult) {
    if (!rollResult || !rollResult.character) return;
    const toast = document.createElement('div');
    toast.className = `rare-toast-banner ${rollResult.rarity.effectClass}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-badge">${rollResult.rarity.badge}</span>
        <img src="${rollResult.character.image}" class="toast-img" />
        <div class="toast-text">
          <div class="toast-title">✨ 超レアキャラ出現！ ✨</div>
          <div class="toast-name">${rollResult.character.name} 「${rollResult.character.praise}」</div>
        </div>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 50);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  // 「▶️ 次の日へ」を押した時：当日の提出状況を保存し、翌日の新しい画面に進む
  goToNextDay() {
    this.saveState();

    const parts = this.selectedDateKey.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      d.setDate(d.getDate() + 1);

      const nextY = d.getFullYear();
      const nextM = String(d.getMonth() + 1).padStart(2, '0');
      const nextD = String(d.getDate()).padStart(2, '0');
      
      const prevDateKey = this.selectedDateKey;
      this.selectedDateKey = `${nextY}-${nextM}-${nextD}`;

      // 翌日の提出物設定がまだない場合、当日の設定を複製して引き継ぐ
      if (!this.dailyItems[this.selectedDateKey]) {
        const currentItems = this.getItemsForDate(prevDateKey);
        this.dailyItems[this.selectedDateKey] = JSON.parse(JSON.stringify(currentItems));
      }

      if (!this.historyState[this.selectedDateKey]) {
        this.historyState[this.selectedDateKey] = {};
      }

      this.saveState();
      this.renderHeader();
      this.renderGrid();
      this.updateProgress();

      if (window.soundEngine) window.soundEngine.playPop();
    }
  }

  // 「◀️ 前の日へ」を押した時：日付を1日戻し過去の提出状況を見直す
  goToPrevDay() {
    this.saveState();

    const parts = this.selectedDateKey.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      d.setDate(d.getDate() - 1);

      const prevY = d.getFullYear();
      const prevM = String(d.getMonth() + 1).padStart(2, '0');
      const prevD = String(d.getDate()).padStart(2, '0');
      
      this.selectedDateKey = `${prevY}-${prevM}-${prevD}`;

      this.saveState();
      this.renderHeader();
      this.renderGrid();
      this.updateProgress();

      if (window.soundEngine) window.soundEngine.playPop();
    }
  }

  bindEvents() {
    // 「◀️ 前の日へ」ボタン
    document.getElementById('btn-prev-day')?.addEventListener('click', () => this.goToPrevDay());

    // 「▶️ 次の日へ」ボタン
    document.getElementById('btn-next-day')?.addEventListener('click', () => this.goToNextDay());
    
    // 日別提出物ポップオーバーの開閉・保存
    const dailyItemsToggleBtn = document.getElementById('btn-daily-items-toggle');
    const dailyItemsCloseBtn = document.getElementById('btn-close-daily-popover');
    const dailyItemsSaveBtn = document.getElementById('btn-save-daily-items');
    const dailyItemsPopover = document.getElementById('daily-items-popover');

    if (dailyItemsToggleBtn) {
      dailyItemsToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDailyItemsPopover();
      });
    }

    if (dailyItemsCloseBtn) {
      dailyItemsCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDailyItemsPopover(false);
      });
    }

    if (dailyItemsSaveBtn) {
      dailyItemsSaveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.saveDailyItemsFromPopover();
      });
    }

    if (dailyItemsPopover) {
      dailyItemsPopover.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // ドロップダウン外クリックで閉じる
    document.addEventListener('click', (e) => {
      if (dailyItemsPopover && dailyItemsPopover.style.display !== 'none') {
        if (!dailyItemsPopover.contains(e.target) && e.target !== dailyItemsToggleBtn) {
          this.toggleDailyItemsPopover(false);
        }
      }
    });
    
    // サウンド切替ボタン
    document.getElementById('btn-toggle-sound')?.addEventListener('click', (e) => {
      if (window.soundEngine) {
        const enabled = window.soundEngine.toggleSound();
        e.target.textContent = enabled ? '🔊 音: ON' : '🔇 音: OFF';
      }
    });

    // 先生用設定モーダル
    const modal = document.getElementById('settings-modal');
    const openBtn = document.getElementById('btn-open-settings');
    const closeBtn = document.getElementById('btn-close-settings');

    if (openBtn && modal) {
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        modal.style.display = 'flex';
        try {
          this.openSettingsModal();
        } catch (err) {
          console.error('Settings modal render error:', err);
        }
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }

    // 未提出者サマリーモーダル
    const summaryModal = document.getElementById('summary-modal');
    const openSumBtn = document.getElementById('btn-open-summary');
    const closeSumBtn = document.getElementById('btn-close-summary');

    if (openSumBtn && summaryModal) {
      openSumBtn.addEventListener('click', (e) => {
        e.preventDefault();
        summaryModal.style.display = 'flex';
        try {
          this.renderUnsubmittedSummary();
        } catch (err) {
          console.error('Summary render error:', err);
        }
      });
    }

    if (closeSumBtn && summaryModal) {
      closeSumBtn.addEventListener('click', () => {
        summaryModal.style.display = 'none';
      });
    }

    if (summaryModal) {
      summaryModal.addEventListener('click', (e) => {
        if (e.target === summaryModal) summaryModal.style.display = 'none';
      });
    }

    // コレクションモーダル
    const collectionModal = document.getElementById('collection-modal');
    const closeCollectionBtn = document.getElementById('btn-close-collection');
    if (closeCollectionBtn && collectionModal) {
      closeCollectionBtn.addEventListener('click', () => {
        collectionModal.style.display = 'none';
      });
    }
    if (collectionModal) {
      collectionModal.addEventListener('click', (e) => {
        if (e.target === collectionModal) collectionModal.style.display = 'none';
      });
    }
  }

  // 設定画面の描画と処理
  openSettingsModal() {
    const studentTextarea = document.getElementById('setting-students-input');
    if (studentTextarea) {
      studentTextarea.value = this.students.map(s => `${s.number}. ${s.name}`).join('\n');
    }

    const saveStudentsBtn = document.getElementById('btn-save-students');
    if (saveStudentsBtn) {
      saveStudentsBtn.onclick = () => {
        const val = studentTextarea ? studentTextarea.value.trim() : '';
        if (!val) return;

        const lines = val.split('\n').filter(l => l.trim().length > 0);
        this.students = lines.map((line, idx) => {
          const cleanName = line.replace(/^\d+[\.\s\:\,-]*/, '').trim();
          return {
            id: `std_${idx + 1}`,
            number: idx + 1,
            name: cleanName || `児童 ${idx + 1}`
          };
        });

        this.saveState();
        this.adjustLayout();
        this.renderGrid();
        this.updateProgress();
        alert('💾 児童名簿を永続保存しました！リロードしても維持されます。');
      };
    }

    this.renderLevelAdjustmentSettings();
    this.renderCharacterSettings();
    this.renderLevelRewardSettings();
  }

  // 👑 クラスレベル & 経験値の手動調整
  renderLevelAdjustmentSettings() {
    const lvlInput = document.getElementById('setting-input-level');
    const expInput = document.getElementById('setting-input-exp');
    const reqGuide = document.getElementById('setting-exp-req-guide');
    const btnLvlDown = document.getElementById('btn-level-down');
    const btnLvlUp = document.getElementById('btn-level-up');
    const btnExpDown = document.getElementById('btn-exp-down');
    const btnExpUp = document.getElementById('btn-exp-up');
    const btnSave = document.getElementById('btn-save-level-manual');

    if (!lvlInput || !expInput) return;

    let currentLvl = this.levelData.currentLevel || 0;
    let currentExp = this.levelData.currentExpInLevel || 0;

    const updateGuideAndLimits = () => {
      const lvl = Math.max(0, parseInt(lvlInput.value, 10) || 0);
      const req = this.getRequiredExpForNextLevel(lvl);
      if (reqGuide) {
        reqGuide.textContent = `/ ${req} 回 (このレベルの必要数)`;
      }
      expInput.max = Math.max(0, req - 1);
    };

    lvlInput.value = currentLvl;
    expInput.value = currentExp;
    updateGuideAndLimits();

    lvlInput.oninput = () => updateGuideAndLimits();
    lvlInput.onchange = () => {
      let val = parseInt(lvlInput.value, 10);
      if (isNaN(val) || val < 0) val = 0;
      lvlInput.value = val;
      updateGuideAndLimits();
    };

    expInput.onchange = () => {
      let val = parseInt(expInput.value, 10);
      if (isNaN(val) || val < 0) val = 0;
      const lvl = Math.max(0, parseInt(lvlInput.value, 10) || 0);
      const req = this.getRequiredExpForNextLevel(lvl);
      if (val >= req) val = Math.max(0, req - 1);
      expInput.value = val;
    };

    if (btnLvlDown) {
      btnLvlDown.onclick = () => {
        let val = Math.max(0, (parseInt(lvlInput.value, 10) || 0) - 1);
        lvlInput.value = val;
        updateGuideAndLimits();
      };
    }

    if (btnLvlUp) {
      btnLvlUp.onclick = () => {
        let val = (parseInt(lvlInput.value, 10) || 0) + 1;
        lvlInput.value = val;
        updateGuideAndLimits();
      };
    }

    if (btnExpDown) {
      btnExpDown.onclick = () => {
        let val = Math.max(0, (parseInt(expInput.value, 10) || 0) - 1);
        expInput.value = val;
      };
    }

    if (btnExpUp) {
      btnExpUp.onclick = () => {
        const lvl = Math.max(0, parseInt(lvlInput.value, 10) || 0);
        const req = this.getRequiredExpForNextLevel(lvl);
        let val = (parseInt(expInput.value, 10) || 0) + 1;
        if (val >= req) val = Math.max(0, req - 1);
        expInput.value = val;
      };
    }

    if (btnSave) {
      btnSave.onclick = () => {
        const newLvl = Math.max(0, parseInt(lvlInput.value, 10) || 0);
        const req = this.getRequiredExpForNextLevel(newLvl);
        let newExp = Math.max(0, parseInt(expInput.value, 10) || 0);
        if (newExp >= req) newExp = Math.max(0, req - 1);

        this.levelData.currentLevel = newLvl;
        this.levelData.currentExpInLevel = newExp;

        this.saveState();
        this.updateLevelUI();
        updateGuideAndLimits();
        alert(`👑 クラスレベルを 【 Lv.${newLvl} 】 (経験値: ${newExp}/${req}) に変更・保存しました！`);
      };
    }
  }

  // 基本キャラクター枠設定 (ファイルサイズ無制限対応)
  renderCharacterSettings() {
    const container = document.getElementById('setting-characters-container');
    if (!container || !window.characterManager) return;
    container.innerHTML = '';

    const rarities = window.characterManager.rarities;

    rarities.forEach(r => {
      const pool = window.characterManager.pools[r.key] || [];
      const sec = document.createElement('div');
      sec.className = 'setting-rarity-section';
      sec.innerHTML = `
        <div class="rarity-header">
          <span class="rarity-badge ${r.effectClass}">${r.badge} ${r.name}</span>
          <span class="rarity-count">登録数: ${pool.length} / 10体</span>
        </div>
        <div class="rarity-pool-grid" id="pool-grid-${r.key}"></div>
        ${pool.length < 10 ? `
          <div class="add-char-form">
            <input type="text" placeholder="キャラ名" id="add-char-name-${r.key}" style="width: 90px;" />
            <input type="text" placeholder="画像URLまたは選択画像" id="add-char-url-${r.key}" style="flex:1;" />
            <input type="file" id="add-char-file-${r.key}" accept="image/*" style="display:none;" />
            <button type="button" class="btn-file-select" id="btn-file-select-${r.key}">画像選択</button>
            <button type="button" class="btn-add-char" data-key="${r.key}">追加</button>
          </div>
        ` : '<p class="max-notice" style="font-size:12px; color:#94a3b8;">※最大10体に達しています</p>'}
      `;

      container.appendChild(sec);

      const poolGrid = sec.querySelector(`#pool-grid-${r.key}`);
      if (poolGrid) {
        pool.forEach((char, idx) => {
          const item = document.createElement('div');
          item.className = 'char-thumb-item';
          item.innerHTML = `
            <img src="${char.image}" alt="${char.name}" class="thumb-img" />
            <div class="thumb-info">
              <span class="thumb-name">${char.name}</span>
            </div>
            <button type="button" class="btn-del-char" data-key="${r.key}" data-idx="${idx}">✕</button>
          `;
          poolGrid.appendChild(item);
        });
      }

      const fileBtn = sec.querySelector(`#btn-file-select-${r.key}`);
      const fileInput = sec.querySelector(`#add-char-file-${r.key}`);
      const urlInput = sec.querySelector(`#add-char-url-${r.key}`);

      if (fileBtn && fileInput) {
        fileBtn.onclick = () => fileInput.click();
      }

      if (fileInput && urlInput) {
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            fileBtn.textContent = '読込中...';
            processImageFile(file, (dataUrl) => {
              urlInput.value = dataUrl;
              fileBtn.textContent = '選択済✓';
            });
          }
        };
      }

      const addCharBtn = sec.querySelector(`.btn-add-char`);
      if (addCharBtn) {
        addCharBtn.onclick = () => {
          const nameIn = sec.querySelector(`#add-char-name-${r.key}`).value.trim() || 'カスタムキャラ';
          const urlIn = urlInput ? urlInput.value.trim() : '';

          if (!urlIn) {
            alert('「画像選択」ボタンから画像を選ぶか、画像URLを入力してください。');
            return;
          }

          const success = window.characterManager.addCharacter(r.key, {
            name: nameIn,
            praise: 'OK！',
            image: urlIn
          });

          if (success) {
            this.renderCharacterSettings();
          }
        };
      }
    });

    container.querySelectorAll('.btn-del-char').forEach(btn => {
      btn.onclick = (e) => {
        const key = e.target.dataset.key;
        const idx = parseInt(e.target.dataset.idx, 10);
        window.characterManager.removeCharacter(key, idx);
        this.renderCharacterSettings();
      };
    });

    const saveCharBtn = document.getElementById('btn-save-characters');
    if (saveCharBtn) {
      saveCharBtn.onclick = async () => {
        const success = await window.characterManager.saveCustomChars();
        if (success) {
          alert('💾 キャラクター設定を永続保存しました！リロードしても維持されます。');
        }
      };
    }

    const resetCharBtn = document.getElementById('btn-reset-characters');
    if (resetCharBtn) {
      resetCharBtn.onclick = () => {
        if (confirm('キャラクター設定を初期状態に戻しますか？')) {
          window.characterManager.resetToDefault();
          this.renderCharacterSettings();
          this.renderLevelRewardSettings();
        }
      };
    }
  }

  // 🏆 レベルアップ解禁キャラクター設定描画 (ファイルサイズ無制限対応・レアリティ選択付き)
  renderLevelRewardSettings() {
    const container = document.getElementById('setting-level-rewards-container');
    if (!container || !window.characterManager) return;
    container.innerHTML = '';

    const rarities = window.characterManager.rarities;

    // レアリティ選択肢のHTML（<option>リスト）を生成するヘルパー
    const makeRarityOptions = (selectedKey = 'rare') => rarities.map(r =>
      `<option value="${r.key}" ${r.key === selectedKey ? 'selected' : ''}>${r.badge} ${r.name}</option>`
    ).join('');

    for (let lvl = 1; lvl <= 5; lvl++) {
      const pool = window.characterManager.levelRewardPools[lvl] || [];
      const sec = document.createElement('div');
      sec.className = 'setting-rarity-section';
      sec.innerHTML = `
        <div class="rarity-header">
          <span class="rarity-badge effect-ssrare">🏆 Lv.${lvl} 解禁キャラクター枠</span>
          <span class="rarity-count">登録数: ${pool.length} / 5体</span>
        </div>
        <div class="rarity-pool-grid" id="lvl-reward-pool-grid-${lvl}"></div>
        ${pool.length < 5 ? `
          <div class="add-char-form" style="flex-wrap:wrap; gap:6px;">
            <input type="text" placeholder="キャラ名" id="add-lvl-char-name-${lvl}" style="width: 90px;" />
            <select id="add-lvl-char-rarity-${lvl}" class="rarity-select-dropdown" title="レアリティを選択">
              ${makeRarityOptions('rare')}
            </select>
            <input type="text" placeholder="画像URLまたは選択画像" id="add-lvl-char-url-${lvl}" style="flex:1; min-width:120px;" />
            <input type="file" id="add-lvl-char-file-${lvl}" accept="image/*" style="display:none;" />
            <button type="button" class="btn-file-select" id="btn-lvl-file-select-${lvl}">画像選択</button>
            <button type="button" class="btn-add-char" data-lvl="${lvl}">追加</button>
          </div>
        ` : '<p class="max-notice" style="font-size:12px; color:#94a3b8;">※最大5体に達しています</p>'}
      `;

      container.appendChild(sec);

      const poolGrid = sec.querySelector(`#lvl-reward-pool-grid-${lvl}`);
      if (poolGrid) {
        pool.forEach((char, idx) => {
          const currentRarityKey = char.rarityKey || 'rare';
          const rarity = rarities.find(r => r.key === currentRarityKey) || rarities[2];

          const item = document.createElement('div');
          item.className = 'char-thumb-item';
          item.innerHTML = `
            <img src="${char.image}" alt="${char.name}" class="thumb-img" />
            <div class="thumb-info">
              <span class="thumb-name">${char.name}</span>
            </div>
            <select class="rarity-select-dropdown thumb-rarity-select" data-lvl="${lvl}" data-idx="${idx}" title="このキャラのレアリティ">
              ${makeRarityOptions(currentRarityKey)}
            </select>
            <button type="button" class="btn-del-lvl-char" data-lvl="${lvl}" data-idx="${idx}">✕</button>
          `;
          poolGrid.appendChild(item);
        });
      }

      const fileBtn = sec.querySelector(`#btn-lvl-file-select-${lvl}`);
      const fileInput = sec.querySelector(`#add-lvl-char-file-${lvl}`);
      const urlInput = sec.querySelector(`#add-lvl-char-url-${lvl}`);

      if (fileBtn && fileInput) {
        fileBtn.onclick = () => fileInput.click();
      }

      if (fileInput && urlInput) {
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            fileBtn.textContent = '読込中...';
            processImageFile(file, (dataUrl) => {
              urlInput.value = dataUrl;
              fileBtn.textContent = '選択済✓';
            });
          }
        };
      }

      const addCharBtn = sec.querySelector(`.btn-add-char`);
      if (addCharBtn) {
        addCharBtn.onclick = () => {
          const nameIn = sec.querySelector(`#add-lvl-char-name-${lvl}`).value.trim() || `Lv.${lvl}解禁キャラ`;
          const urlIn = urlInput ? urlInput.value.trim() : '';
          const raritySelect = sec.querySelector(`#add-lvl-char-rarity-${lvl}`);
          const rarityKeyIn = raritySelect ? raritySelect.value : 'rare';

          if (!urlIn) {
            alert('「画像選択」ボタンから画像を選ぶか、画像URLを入力してください。');
            return;
          }

          const success = window.characterManager.addLevelRewardCharacter(lvl, {
            name: nameIn,
            praise: 'OK！',
            image: urlIn,
            rarityKey: rarityKeyIn
          });

          if (success) {
            this.renderLevelRewardSettings();
          }
        };
      }
    }

    // 既登録キャラのレアリティ変更ドロップダウン
    container.querySelectorAll('.thumb-rarity-select').forEach(sel => {
      sel.onchange = (e) => {
        const lvl = parseInt(e.target.dataset.lvl, 10);
        const idx = parseInt(e.target.dataset.idx, 10);
        const newKey = e.target.value;
        window.characterManager.updateLevelRewardCharacterRarity(lvl, idx, newKey);
      };
    });

    // 削除ボタン
    container.querySelectorAll('.btn-del-lvl-char').forEach(btn => {
      btn.onclick = (e) => {
        const lvl = parseInt(e.target.dataset.lvl, 10);
        const idx = parseInt(e.target.dataset.idx, 10);
        window.characterManager.removeLevelRewardCharacter(lvl, idx);
        this.renderLevelRewardSettings();
      };
    });
  }

  // 📚 コレクションモーダルの表示
  showCollectionModal(studentId) {
    const modal = document.getElementById('collection-modal');
    const titleEl = document.getElementById('collection-modal-title');
    const bodyEl = document.getElementById('collection-modal-body');
    if (!modal || !bodyEl || !window.characterManager) return;

    const student = this.students.find(s => s.id === studentId);
    if (!student) return;

    if (titleEl) {
      titleEl.textContent = `📚 ${student.name} のコレクション`;
    }

    // 全履歴から、この児童が受け取ったキャラ画像URLを収集
    const collectedImages = new Set();
    Object.values(this.historyState).forEach(dayState => {
      if (!dayState[studentId]) return;
      Object.values(dayState[studentId]).forEach(itemState => {
        if (itemState && itemState.checked && itemState.char && itemState.char.character && itemState.char.character.image) {
          collectedImages.add(itemState.char.character.image);
        }
      });
    });

    // マスターリストを取得
    const master = window.characterManager.getCharMasterList();

    // レアリティ別にグループ化
    const rarities = window.characterManager.rarities;
    bodyEl.innerHTML = '';

    // 取得済み総数 / 全体総数
    const totalCollected = master.filter(c => collectedImages.has(c.image)).length;
    const totalMaster = master.length;

    // ヘッダー統計
    const statsDiv = document.createElement('div');
    statsDiv.className = 'collection-stats';
    statsDiv.innerHTML = `
      <span class="collection-stat-total">コレクション達成: <strong>${totalCollected}</strong> / <strong>${totalMaster}</strong> 体</span>
      <div class="collection-stat-bar-track"><div class="collection-stat-bar-fill" style="width:${totalMaster > 0 ? Math.floor(totalCollected/totalMaster*100) : 0}%"></div></div>
    `;
    bodyEl.appendChild(statsDiv);

    rarities.forEach(rarity => {
      const rarityChars = master.filter(c => c.rarityKey === rarity.key);
      if (rarityChars.length === 0) return;

      const collectedInRarity = rarityChars.filter(c => collectedImages.has(c.image)).length;

      const section = document.createElement('div');
      section.className = 'collection-rarity-section';

      const headerDiv = document.createElement('div');
      headerDiv.className = `collection-rarity-header ${rarity.effectClass}`;
      headerDiv.innerHTML = `
        <span class="collection-rarity-badge">${rarity.badge} ${rarity.name}</span>
        <span class="collection-rarity-count">${collectedInRarity} / ${rarityChars.length}</span>
      `;
      section.appendChild(headerDiv);

      const grid = document.createElement('div');
      grid.className = 'collection-char-grid';

      rarityChars.forEach(charInfo => {
        const obtained = collectedImages.has(charInfo.image);
        const card = document.createElement('div');
        card.className = `collection-char-card ${obtained ? 'obtained' : 'locked'}`;

        card.innerHTML = `
          <div class="collection-char-no">No.${charInfo.no}</div>
          <div class="collection-char-img-wrap">
            ${obtained
              ? `<img src="${charInfo.image}" alt="${charInfo.name}" class="collection-char-img" />`
              : `<div class="collection-char-silhouette">？</div>`
            }
          </div>
          <div class="collection-char-name">${obtained ? charInfo.name : '？？？'}</div>
          ${charInfo.source !== 'basic' ? `<div class="collection-char-badge-lv">🔓 Lv.${charInfo.source.replace('lv','')}</div>` : ''}
        `;
        grid.appendChild(card);
      });

      section.appendChild(grid);
      bodyEl.appendChild(section);
    });

    modal.style.display = 'flex';
  }

  // 未提出者確認サマリーの表示
  renderUnsubmittedSummary() {
    const body = document.getElementById('summary-list-body');
    if (!body) return;
    body.innerHTML = '';

    let unsubmittedStudents = [];
    const currentItems = this.getItemsForDate(this.selectedDateKey);

    this.students.forEach(std => {
      const missingItems = currentItems.filter(item => !this.getItemState(std.id, item.id, this.selectedDateKey).checked);
      if (missingItems.length > 0) {
        unsubmittedStudents.push({
          student: std,
          missing: missingItems
        });
      }
    });

    if (unsubmittedStudents.length === 0) {
      body.innerHTML = `
        <div style="text-align: center; padding: 20px; font-weight: 700; color: #10b981; font-size: 16px;">
          🎉 本日の提出物は全員すべて完了しています！素晴らしい！
        </div>
      `;
    } else {
      unsubmittedStudents.forEach(item => {
        const row = document.createElement('div');
        row.className = 'summary-row';
        row.innerHTML = `
          <div class="summary-std-info">
            <span class="num">${item.student.number}</span>
            <span class="name">${item.student.name}</span>
          </div>
          <div class="summary-missing-items">
            ${item.missing.map(m => `<span class="missing-badge">${m.icon} ${m.name}</span>`).join('')}
          </div>
        `;
        body.appendChild(row);
      });
    }
  }
}

// アプリ起動
window.addEventListener('DOMContentLoaded', () => {
  window.app = new MorningSubmissionApp();
});
