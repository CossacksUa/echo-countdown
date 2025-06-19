import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, ItemView, Notice } from 'obsidian';

// Constants
export const POMODORO_VIEW_TYPE = "pomodoro-timer-view";
const ICON_NAME = "bell"; // Іконка, яку буде використовувати плагін

// Інтерфейс для налаштувань плагіна
interface PomodoroSettings {
    pomodoroDuration: number; // in minutes
    shortBreakDuration: number; // in minutes
    longBreakDuration: number; // in minutes
    soundOnFinish: boolean;
}

// Дефолтні значення налаштувань
const DEFAULT_SETTINGS: PomodoroSettings = {
    pomodoroDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    soundOnFinish: true,
};

// Клас, що представляє нашу постійну панель (View)
class PomodoroView extends ItemView {
    plugin: MyPomodoroPlugin;
    timerDisplayEl: HTMLElement;
    progressBarSvg: SVGElement;
    progressBarCircle: SVGCircleElement;
    modeDisplayEl: HTMLElement; // Для відображення поточного режиму (Фокус, Короткий відпочинок)

    startButton: HTMLButtonElement;
    pauseButton: HTMLButtonElement;
    stopButton: HTMLButtonElement;
    skipButton: HTMLButtonElement; // Кнопка для пропуску поточної фази
    longBreakButton: HTMLButtonElement; // Кнопка для великої перерви

    constructor(leaf: WorkspaceLeaf, plugin: MyPomodoroPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    // Повертає унікальний ідентифікатор для нашого View
    getViewType() {
        return POMODORO_VIEW_TYPE;
    }

    // Повертає назву, яка відображатиметься у заголовку панелі
    getDisplayText() {
        return "Таймер Echo Countdown";
    }

    // Повертає іконку для панелі
    getIcon() {
        return ICON_NAME;
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('pomodoro-view-container'); // Клас для загального стилю панелі

        // Контейнер для відображення режиму (Фокус, Короткий відпочинок)
        this.modeDisplayEl = container.createEl('div', { cls: 'pomodoro-mode-display' });

        // Контейнер для таймера та прогрес-бару
        const timerContainer = container.createEl('div', { cls: 'pomodoro-timer-container' });

        // SVG для прогрес-бару
        this.progressBarSvg = timerContainer.createSvg('svg', { cls: 'pomodoro-progress-svg' });
        this.progressBarSvg.setAttrs({ viewBox: "0 0 100 100" });

        // Коло фону
        this.progressBarSvg.createSvg('circle', { cls: 'pomodoro-progress-bg' })
            .setAttrs({ cx: "50", cy: "50", r: "45" });

        // Коло прогресу
        this.progressBarCircle = this.progressBarSvg.createSvg('circle', { cls: 'pomodoro-progress-fg' })
            .setAttrs({ cx: "50", cy: "50", r: "45" });
        // Елемент для відображення часу
        this.timerDisplayEl = timerContainer.createEl('div', { cls: 'pomodoro-timer-display' });

        // Кнопки управління
        const buttonContainer = container.createEl('div', { cls: 'pomodoro-controls' }); // Виправлено назву класу
        this.startButton = buttonContainer.createEl('button', { text: 'Почати', cls: 'pomodoro-button mod-cta' }); // Додано pomodoro-button
        this.pauseButton = buttonContainer.createEl('button', { text: 'Пауза', cls: 'pomodoro-button' }); // Додано pomodoro-button
        this.stopButton = buttonContainer.createEl('button', { text: 'Зупинити', cls: 'pomodoro-button' }); // Додано pomodoro-button
        this.skipButton = buttonContainer.createEl('button', { text: 'Пропустити', cls: 'pomodoro-button' }); // Додано pomodoro-button
        this.longBreakButton = buttonContainer.createEl('button', { text: 'Довга перерва', cls: 'pomodoro-button' }); // Додано pomodoro-button

        // Події кнопок викликають методи плагіна
        this.startButton.onclick = () => this.plugin.startTimer();
        this.pauseButton.onclick = () => this.plugin.pauseTimer();
        this.stopButton.onclick = () => this.plugin.stopTimer();
        this.skipButton.onclick = () => this.plugin.skipCurrentPhase();
        this.longBreakButton.onclick = () => this.plugin.startLongBreak();

        // Прив'язуємо методи View до плагіна для оновлення
        this.plugin.updateViewDisplay = this.updateDisplay.bind(this);
        this.plugin.updateViewProgressBar = this.updateProgressBar.bind(this);
        this.plugin.updateViewButtonStates = this.updateButtonStates.bind(this);
        this.plugin.updateViewMode = this.updateModeDisplay.bind(this);

        // Первинне відображення на основі стану плагіна
        this.updateDisplay();
        this.updateProgressBar();
        this.updateButtonStates();
        this.updateModeDisplay();
    }

    async onClose() {
        this.plugin.updateViewDisplay = null;
        this.plugin.updateViewProgressBar = null;
        this.plugin.updateViewButtonStates = null;
        this.plugin.updateViewMode = null;
    }

    // --- Методи для оновлення UI View (читають стан з плагіна) ---

    public updateDisplay() {
        if (!this.timerDisplayEl) return;
        const { timeLeft } = this.plugin.getTimerData();
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        this.timerDisplayEl.setText(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }

    public updateProgressBar() {
        if (!this.progressBarCircle || !this.progressBarSvg) return;

        const { timeLeft, currentDuration, currentMode } = this.plugin.getTimerData();
        const radius = 45;
        const circumference = 2 * Math.PI * radius;

        const elapsedTime = currentDuration - timeLeft;
        const progressFraction = currentDuration > 0 ? elapsedTime / currentDuration : 0;
        const strokeDashoffsetValue = (circumference - (progressFraction * circumference)).toFixed(0);

        this.progressBarCircle.setAttrs({
            'stroke-dasharray': circumference.toFixed(0),
            'stroke-dashoffset': strokeDashoffsetValue
        });

        // Вибір кольорів та світіння
        let accentColor = '';
        let filterValue = 'none'; // За замовчуванням світіння відсутнє

        if (currentMode === 'pomodoro') {
            accentColor = 'var(--division-pomodoro-color)';
            // filterValue залишається 'none', щоб прибрати світіння з фокусу
        } else if (currentMode === 'shortBreak') {
            accentColor = 'var(--division-short-break-color)';
            filterValue = `drop-shadow(0 0 12px rgba(174, 234, 0, 0.7))`; // Світіння для короткої перерви
        } else if (currentMode === 'longBreak') {
            accentColor = 'var(--division-long-break-color)';
            filterValue = `drop-shadow(0 0 12px rgba(0, 191, 165, 0.7))`; // Світіння для довгої перерви
        } else { // stopped or initial state
            this.progressBarCircle.setAttribute('stroke', 'var(--division-text-color)');
            this.progressBarSvg.style.filter = 'none';
            return;
        }

        this.progressBarCircle.setAttribute('stroke', accentColor);
        this.progressBarSvg.style.filter = filterValue; // Застосовуємо визначений filterValue
    }

    public updateButtonStates() {
        if (!this.startButton || !this.pauseButton || !this.stopButton || !this.skipButton || !this.longBreakButton) return;

        const { isRunning, currentMode, timeLeft } = this.plugin.getTimerData();
        const initialPomodoroTime = this.plugin.settings.pomodoroDuration * 60;

        console.log(`[PomodoroView.updateButtonStates] isRunning: ${isRunning}, currentMode: ${currentMode}, timeLeft: ${timeLeft}`);

        // Кнопка "Почати"
        this.startButton.disabled = isRunning;

        // Кнопка "Пауза"
        this.pauseButton.disabled = !isRunning;

        // Кнопка "Зупинити"
        // Увімкнена, якщо таймер працює АБО на паузі, і це не початковий стан
        this.stopButton.disabled = (currentMode === 'stopped' && timeLeft === initialPomodoroTime);

        // Кнопка "Пропустити"
        // Вимкнена, якщо таймер не працює АБО поточний режим не "pomodoro"
        this.skipButton.disabled = !isRunning || currentMode !== 'pomodoro';

        // Кнопка "Довга перерва"
        // Вимкнена, якщо таймер працює АБО поточний режим - це вже будь-яка перерва
        this.longBreakButton.disabled = isRunning || currentMode === 'shortBreak' || currentMode === 'longBreak';
    }

    public updateModeDisplay() {
        if (!this.modeDisplayEl) return;

        const { currentMode } = this.plugin.getTimerData();
        let modeText = '';
        if (currentMode === 'pomodoro') {
            modeText = 'Фокус';
        } else if (currentMode === 'shortBreak') {
            modeText = 'Короткий відпочинок';
        } else if (currentMode === 'longBreak') {
            modeText = 'Довгий відпочинок';
        } else {
            modeText = 'Таймер'; // Коли зупинено
        }
        this.modeDisplayEl.setText(modeText);
    }
}

export default class MyPomodoroPlugin extends Plugin {
    settings: PomodoroSettings;

    private currentMode: 'pomodoro' | 'shortBreak' | 'longBreak' | 'stopped' = 'stopped';
    private currentDuration: number; // in seconds
    private timeLeft: number; // in seconds
    private isRunning: boolean = false;
    private intervalId: number | null = null;
    private totalPomodoros: number = 0; // Лічильник завершених Pomodoro сесій

    public updateViewDisplay: (() => void) | null = null;
    public updateViewProgressBar: (() => void) | null = null;
    public updateViewButtonStates: (() => void) | null = null;
    public updateViewMode: (() => void) | null = null;


    async onload() {
        await this.loadSettings();

        // Ініціалізація початкової тривалості
        this.currentDuration = this.settings.pomodoroDuration * 60;
        this.timeLeft = this.currentDuration;

        this.registerView(
            POMODORO_VIEW_TYPE,
            (leaf) => new PomodoroView(leaf, this)
        );

        this.addRibbonIcon(ICON_NAME, 'Echo Countdown', async () => {
            this.activateView();
        });

        this.addCommand({
            id: 'echo_countdown',
            name: 'Відкрити/перемкнути таймер Echo Countdown',
            callback: () => {
                this.activateView();
            }
        });

        this.addSettingTab(new PomodoroSettingTab(this.app, this));

        console.log('My Pomodoro Plugin loaded!');
    }

    onunload() {
        this.stopTimer(); // Зупинити таймер при вивантаженні плагіна
        console.log('My Pomodoro Plugin unloaded.');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(POMODORO_VIEW_TYPE);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({
                type: POMODORO_VIEW_TYPE,
                active: true,
            });
        }
        workspace.revealLeaf(leaf);
    }

    // --- Логіка таймера ---

    public startTimer(mode: 'pomodoro' | 'shortBreak' | 'longBreak' = 'pomodoro') {
        console.log(`[startTimer] Викликано з режимом: ${mode}. Поточний режим ДО СТАРТУ: ${this.currentMode}, isRunning: ${this.isRunning}`);

        if (this.isRunning && this.currentMode === mode) {
            console.log(`[startTimer] Таймер вже працює в режимі ${mode}. Вихід.`);
            return;
        }

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log(`[startTimer] Попередній інтервал зупинено.`);
        }

        // Встановлюємо новий режим та його тривалість, якщо це новий старт або зміна режиму
        // АБО якщо ми були у "stopped" стані
        if (this.currentMode !== mode || this.currentMode === 'stopped') {
            this.currentMode = mode; // Встановлюємо новий режим ПЕРЕД обчисленням тривалості
            if (mode === 'pomodoro') {
                this.currentDuration = this.settings.pomodoroDuration * 60;
            } else if (mode === 'shortBreak') {
                this.currentDuration = this.settings.shortBreakDuration * 60;
            } else { // longBreak
                this.currentDuration = this.settings.longBreakDuration * 60;
            }
            this.timeLeft = this.currentDuration; // Скидаємо до повної тривалості для нового циклу
            console.log(`[startTimer] Новий запуск або зміна режиму. Режим: ${this.currentMode}, Повна тривалість: ${this.currentDuration}s`);
        } else {
            // Якщо таймер був на паузі в тому ж режимі, продовжуємо з поточного timeLeft
            console.log(`[startTimer] Продовження відліку. Режим: ${this.currentMode}, Залишилось: ${this.timeLeft}s`);
        }

        this.isRunning = true;
        console.log(`[startTimer] Таймер запущено. Режим: ${this.currentMode}, Залишилось: ${this.timeLeft}s`);

        this.updateAllDisplays(); // Оновити UI при старті

        this.intervalId = window.setInterval(() => {
            this.timeLeft--;
            this.updateAllDisplays(); // Оновити UI під час роботи

            if (this.timeLeft <= 0) {
                // Зберігаємо попередній режим перед зупинкою, щоб handleTimerEnd міг його використати
                const finishedMode = this.currentMode;
                this.stopTimer(); // Зупиняємо таймер (це встановлює currentMode на 'stopped')
                console.log(`[Timer] Час вийшов для режиму: ${finishedMode}`);
                this.handleTimerEnd(false, finishedMode); // Передаємо finishedMode
            }
        }, 1000);
    }

    public pauseTimer() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log(`[pauseTimer] Таймер на паузі. currentMode: ${this.currentMode}, timeLeft: ${this.timeLeft}`);
        this.updateAllDisplays(); // Оновити UI після паузи
    }

    public stopTimer() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log(`[stopTimer] Інтервал зупинено.`);
        }
        this.isRunning = false;
        this.currentMode = 'stopped'; // Скидаємо режим до 'stopped'
        this.timeLeft = this.settings.pomodoroDuration * 60; // Скидаємо час до початкової тривалості Pomodoro
        this.updateAllDisplays(); // Оновити UI після зупинки
        console.log(`[stopTimer] Таймер зупинено. currentMode: ${this.currentMode}, timeLeft: ${this.timeLeft}`);
    }

    public skipCurrentPhase() {
        console.log(`[skipCurrentPhase] Натиснуто кнопку "Пропустити". Поточний режим: ${this.currentMode}, isRunning: ${this.isRunning}`);
        if (this.currentMode === 'pomodoro') {
            const skippedMode = this.currentMode; // Зберігаємо режим, який пропускаємо
            this.stopTimer(); // Зупиняємо таймер і скидаємо currentMode на 'stopped'
            console.log(`[skipCurrentPhase] Фазу Pomodoro пропущено. Запускаємо обробку кінця фази.`);
            this.handleTimerEnd(true, skippedMode); // Передаємо skippedMode
        } else {
            new Notice('Перерву не можна пропустити цим способом.');
            console.log(`[skipCurrentPhase] Спроба пропустити фазу ${this.currentMode}, що не дозволено. currentMode: ${this.currentMode}`);
            this.updateAllDisplays(); // Оновлюємо UI, щоб кнопка відобразила правильний стан
        }
    }

    public startLongBreak() {
        console.log(`[startLongBreak] Викликано. Запускаємо довгу перерву.`);
        this.startTimer('longBreak');
    }

    // ОНОВЛЕНО: handleTimerEnd тепер приймає finishedMode як аргумент
    private handleTimerEnd(skipped: boolean = false, finishedMode: 'pomodoro' | 'shortBreak' | 'longBreak' | 'stopped' = 'stopped') {
        console.log(`[handleTimerEnd] Викликано. Завершений режим: ${finishedMode}, пропущено: ${skipped}`);

        if (!skipped && this.settings.soundOnFinish) {
            const audio = new Audio('https://www.soundjay.com/buttons/beep-07a.mp3');
            audio.play().catch(e => console.error("Could not play sound:", e));
        }

        // Повідомлення про завершення/пропуск фази
        let noticeMessage = '';
        if (finishedMode === 'pomodoro') {
            noticeMessage = skipped ? 'Фазу розробки пропущено.' : 'Фаза розробки завершена!';
        } else { // shortBreak or longBreak
            noticeMessage = skipped ? 'Фазу перерви пропущено.' : 'Фаза перерви завершена!';
        }
        new Notice(noticeMessage);

        // Логіка переходу до наступної фази на основі finishedMode
        if (finishedMode === 'pomodoro') {
            this.totalPomodoros++;
            console.log(`[handleTimerEnd] Помідоро завершено. Загальна кількість помідорів: ${this.totalPomodoros}`);
            new Notice('Час для Короткого відпочинку! Починається 5-хвилинна перерва.');
            this.startTimer('shortBreak'); // Починаємо коротку перерву
            console.log(`[handleTimerEnd] Перехід до короткої перерви. Наступний режим встановлено: shortBreak`);
        } else { // Після перерви (короткої чи довгої), повертаємося до Pomodoro
            console.log(`[handleTimerEnd] Перерва завершена. Попередній режим був: ${finishedMode}`);
            new Notice('Перерва закінчена! Починається новий цикл Pomodoro.');
            this.startTimer('pomodoro'); // Починаємо фазу Pomodoro
            console.log(`[handleTimerEnd] Перехід до Pomodoro. Наступний режим встановлено: pomodoro`);
        }
    }


    // --- Допоміжні функції для доступу View ---

    public getTimerData() {
        return {
            timeLeft: this.timeLeft,
            currentDuration: this.currentDuration,
            currentMode: this.currentMode,
            isRunning: this.isRunning
        };
    }

    // Функції для оновлення UI View з плагіна
    private updateAllDisplays() {
        if (this.updateViewDisplay) {
            this.updateViewDisplay();
        }
        if (this.updateViewProgressBar) {
            this.updateViewProgressBar();
        }
        if (this.updateViewButtonStates) {
            this.updateViewButtonStates();
        }
        if (this.updateViewMode) {
            this.updateViewMode();
        }
    }
}

class PomodoroSettingTab extends PluginSettingTab {
    plugin: MyPomodoroPlugin;

    constructor(app: App, plugin: MyPomodoroPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Налаштування Echo Countdown' });

        new Setting(containerEl)
            .setName('Тривалість Echo Countdown')
            .setDesc('Кількість хвилин для одного сеансу Echo Countdown')
            .addText(text => text
                .setPlaceholder('25')
                .setValue(this.plugin.settings.pomodoroDuration.toString())
                .onChange(async (value) => {
                    this.plugin.settings.pomodoroDuration = parseInt(value) || DEFAULT_SETTINGS.pomodoroDuration;
                    await this.plugin.saveSettings();
                    // Оновити тривалість, якщо таймер зупинено
                    if (this.plugin.getTimerData().currentMode === 'stopped') {
                        // Якщо таймер зупинено, скидаємо його, щоб оновити timeLeft до нового значення PomodoroDuration
                        this.plugin.stopTimer(); // stopTimer вже оновлює timeLeft до PomodoroDuration
                    }
                }));

        new Setting(containerEl)
            .setName('Тривалість короткої перерви')
            .setDesc('Кількість хвилин для короткої перерви')
            .addText(text => text
                .setPlaceholder('5')
                .setValue(this.plugin.settings.shortBreakDuration.toString())
                .onChange(async (value) => {
                    this.plugin.settings.shortBreakDuration = parseInt(value) || DEFAULT_SETTINGS.shortBreakDuration;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Тривалість довгої перерви')
            .setDesc('Кількість хвилин для довгої перерви')
            .addText(text => text
                .setPlaceholder('15')
                .setValue(this.plugin.settings.longBreakDuration.toString())
                .onChange(async (value) => {
                    this.plugin.settings.longBreakDuration = parseInt(value) || DEFAULT_SETTINGS.longBreakDuration;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Звук після завершення')
            .setDesc('Відтворювати звук після завершення Echo Countdown або перерви')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.soundOnFinish)
                .onChange(async (value) => {
                    this.plugin.settings.soundOnFinish = value;
                    await this.plugin.saveSettings();
                }));
    }
}