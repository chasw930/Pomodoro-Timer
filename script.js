// --- 통계 팝업 열기 ---
  function openStatsPopup() {
    updateStats(); // 통계 정보 최신화
    document.getElementById('statsPopupOverlay').style.display = 'flex';
  }

  // --- 통계 팝업 닫기 ---
  function closeStatsPopup() {
    document.getElementById('statsPopupOverlay').style.display = 'none';
  }

  // --- 통계 업데이트 ---
  function updateStats() {
    const stats = JSON.parse(localStorage.getItem('focusStats')) || { daily: {}, monthly: {} };
    const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const monthKey = new Date().toISOString().slice(0, 7);  // YYYY-MM

    const todayStats = stats.daily[todayKey] || { count: 0, time: 0 };
    const monthStats = stats.monthly[monthKey] || { count: 0, time: 0 };

    // 오늘 통계
    document.getElementById('todayFocusCount').textContent = `집중 횟수 ${todayStats.count}회`;
    document.getElementById('todayFocusTime').textContent = `집중 시간 ${formatTime(todayStats.time)}`;

    // 이달 통계
    document.getElementById('monthFocusCount').textContent = `집중 횟수 ${monthStats.count}회`;
    document.getElementById('monthFocusTime').textContent = `집중 시간 ${formatTime(monthStats.time)}`;

    const totalButton = document.getElementById('totalButton');
    if (totalButton) {
      totalButton.textContent = `𝐓𝐨𝐭𝐚𝐥 ${monthStats.count}★`;
    }
  }

  // --- 시간 포맷 변환 ---
  function formatTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}시간 ${minutes}분`;
  }

  // --- 엑셀 다운로드 ---
  function downloadStatsAsExcel() {
    const stats = JSON.parse(localStorage.getItem('focusStats')) || { daily: {}, monthly: {} };

    const now = new Date();

    // 필터 기준일
    const cutoffDaily = new Date();
    cutoffDaily.setDate(cutoffDaily.getDate() - 30);

    const cutoffMonthly = new Date();
    cutoffMonthly.setMonth(cutoffMonthly.getMonth() - 12);

    // daily 데이터
    let content = `집중 날짜,횟수,시간(분)\n`;
    for (const [date, data] of Object.entries(stats.daily)) {
      const dateObj = new Date(date);
      if (dateObj >= cutoffDaily) {
        content += `${date},${data.count},${data.time}\n`;
      }
    }

    // monthly 데이터
    content += `\n\n월별 통계 (최근 12개월)\n월,횟수,시간(분)\n`;
      for (const [month, data] of Object.entries(stats.monthly)) {
        const [y, m] = month.split('-').map(Number);
        const monthDate = new Date(y, m - 1);
        if (monthDate >= cutoffMonthly) {
          content += `${month},${data.count},${data.time}\n`;
        }
      }

  const BOM = '\uFEFF'; 
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'pomodoro_stats.xlsx';
  link.click();
}

  // 집중 완료 시 stats에 저장 (반복 시점)
  function recordFocusSession(durationMinutes) {
    const stats = JSON.parse(localStorage.getItem('focusStats')) || { daily: {}, monthly: {} };
    const today = new Date();
    const todayKey = new Date().toISOString().slice(0, 10);
    const monthKey = new Date().toISOString().slice(0, 7);

    if (!stats.daily[todayKey]) stats.daily[todayKey] = { count: 0, time: 0 };
    if (!stats.monthly[monthKey]) stats.monthly[monthKey] = { count: 0, time: 0 };

    stats.daily[todayKey].count += 1;
    stats.daily[todayKey].time += durationMinutes;

    stats.monthly[monthKey].count += 1;
    stats.monthly[monthKey].time += durationMinutes;

    // --- 30일 이상 지난 daily 데이터 삭제 ---
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    for (const date in stats.daily) {
      if (new Date(date) < cutoffDate) {
        delete stats.daily[date];
      }
    }

    // --- 12개월 초과 monthly 데이터 삭제 ---
    const maxMonthlyDate = new Date(today);
    maxMonthlyDate.setMonth(maxMonthlyDate.getMonth() - 12);

    for (const month of Object.keys(stats.monthly)) {
      const [y, m] = month.split('-').map(Number);
      const monthDate = new Date(y, m - 1); // 0-based month
      if (monthDate < maxMonthlyDate) {
        delete stats.monthly[month];
      }
    }

      localStorage.setItem('focusStats', JSON.stringify(stats));
      updateStats();
  }

  let timeLeft = 0;
  let timerInterval;
  let expectedEndTimestamp;
  let isRunning = false;
  let currentMode = 'pomodoro';

  let completedCycles = 0;
  let pomodoroCount = 0;

  const alarm = document.getElementById('alarmSound');
  const volumeControl = document.getElementById('volumeControl');

  volumeControl.addEventListener('input', () => {
  alarm.volume = parseFloat(volumeControl.value);
  localStorage.setItem('userVolume', volumeControl.value); 
});

// --- 타이머 디스플레이 업데이트 ---
  function updateTimerDisplay() {
    let minutes = Math.floor(timeLeft / 60);
    let seconds = timeLeft % 60;
    document.getElementById('timer').innerText = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

// --- 타이머 리셋 ---
function resetTimer(isManual = true) { 
    clearInterval(timerInterval);
    isRunning = false;

    timeLeft = getDurationForMode(currentMode) * 60;
    updateTimerDisplay();
    document.getElementById('startBtn').innerText = '𝚂𝚃𝙰𝚁𝚃';
    
    // 수동 리셋 시 필요한 모든 초기화/UI/알람 로직을 한 번에 처리합니다.
    if (isManual) { 
        // 1. 카운터 초기화
        pomodoroCount = 0;
        completedCycles = 0; 
        localStorage.setItem('pomodoroCount', pomodoroCount);
        localStorage.setItem('completedCycles', completedCycles);
        updateHearts(); // UI도 0으로 초기화
        
        // 2. 알람 초기화
        alarm.pause();
        alarm.currentTime = 0;
    }
}

// 모드 전환 함수 (탭 클릭 시)
function switchMode(mode) {
    currentMode = mode;
    resetTimer(false); 

    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.tab.${mode}`).classList.add('active');
}

  // --- onPomodoroComplete 함수 (통계 기록 및 카운트) ---
function onPomodoroComplete() {
    const durationMinutes = getDurationForMode('pomodoro');
    recordFocusSession(durationMinutes);

    pomodoroCount++; 

    if (pomodoroCount > 4) {
        pomodoroCount = 1;
        completedCycles++; 
    }
    
    if (document.getElementById('autoRepeatToggle').checked) {
        localStorage.setItem('completedCycles', completedCycles); 
        localStorage.setItem('pomodoroCount', pomodoroCount);
        
        updateHearts(); 
    }
}

// --- switchSession 함수 (다음 모드 전환) ---
function switchSession() {
    let nextMode;
    
    if (currentMode === 'pomodoro') {
        nextMode = 'short';
    } else {
        
        if (currentMode === 'short' && pomodoroCount === 4) {
             nextMode = 'long';
        } else {
             nextMode = 'pomodoro';
        }
    }

    switchMode(nextMode);
}

// --- updateHearts 함수 ---
function updateHearts() {
    let hearts = '';
    const displayCount = pomodoroCount % 4 === 0 && pomodoroCount !== 0 ? 4 : pomodoroCount % 4;
    
    for (let i = 0; i < 4; i++) {
        hearts += (i < displayCount) ? '★彡' : '☆彡';
    }

    document.getElementById('heartTracker').innerHTML = hearts;
    localStorage.setItem('pomodoroCount', pomodoroCount);
    localStorage.setItem('completedCycles', completedCycles);
}
 function updateTimer() {
    const remaining = Math.round((expectedEndTimestamp - Date.now()) / 1000);
    timeLeft = Math.max(remaining, 0);

    if (timeLeft <= 0) {
        clearInterval(timerInterval);
        isRunning = false;
        document.getElementById('startBtn').innerText = '𝚂𝚃𝙰𝚁𝚃';
        
        alarm.play().catch(error => {
            console.error('Alarm play error:', error);
        });
        
        setTimeout(() => {
            
            const autoRepeatCheckbox = document.getElementById('autoRepeatToggle');
            const messages = JSON.parse(localStorage.getItem('userMessages') || '{}');
            const workDone = messages.work || '작업 완료!';
            const breakDone = messages.break || '휴식 끝!';
            
            if (autoRepeatCheckbox.checked) {
                // --- 자동 반복 ON 시 로직 ---
                if (currentMode === 'pomodoro') {
                    onPomodoroComplete();
                    showMessageBox(`${workDone}<div class="subtext">${pomodoroCount}회 반복 중・°꩜</div>`);
                } else if (currentMode === 'long') {
                    showMessageBox('긴 휴식 완료!');

                    pomodoroCount = 0;
                    completedCycles = 0;
                    localStorage.setItem('pomodoroCount', 0);
                    localStorage.setItem('completedCycles', 0);
                    updateHearts();

                    clearInterval(timerInterval);
                    isRunning = false;
                    document.getElementById('startBtn').innerText = '𝚂𝚃𝙰𝚁𝚃';

                    switchMode('pomodoro');
                    
                    return; 

                } else {
                    showMessageBox(`${breakDone}<div class="subtext">${pomodoroCount}회 반복 완료・°꩜</div>`);
                }
                
                switchSession(); 
                toggleTimer();

            } else {
                // --- 자동 반복 OFF 시 로직 (기존 로직 유지) ---
                if (currentMode === 'pomodoro') {
                    recordFocusSession(getDurationForMode('pomodoro'));
                    showMessageBox(`${workDone}`);
                } else {
                    showMessageBox(`${breakDone}`);
                }

                switchMode('pomodoro');
            }
            
        }, 300); 
        
    } else {
        updateTimerDisplay();
    }
}

// 타이머 시작/정지 토글 함수
  function toggleTimer() {
    if (isRunning) {
        clearInterval(timerInterval);
        isRunning = false;
        document.getElementById('startBtn').innerText = '𝚂𝚃𝙰𝚁𝚃';
    } else {
        
        isRunning = true;
        document.getElementById('startBtn').innerText = '𝙿𝙰𝚄𝚂𝙴';

        expectedEndTimestamp = Date.now() + timeLeft * 1000;
        timerInterval = setInterval(updateTimer, 1000);
    }
  }

  function getDurationForMode(mode) {
    const savedTimes = JSON.parse(localStorage.getItem('userTimes') || '{}');
    const pomodoro = parseInt(document.getElementById('pomodoroTime').value, 10) || savedTimes.pomodoro || 25;
    const short = parseInt(document.getElementById('shortTime').value, 10) || savedTimes.short || 5;
    const long = parseInt(document.getElementById('longTime').value, 10) || savedTimes.long || 15;
    return mode === 'pomodoro' ? pomodoro : mode === 'short' ? short : long;
}

// 자동반복기능
const autoRepeatCheckbox = document.getElementById('autoRepeatToggle');
const heartTracker = document.getElementById('heartTracker');

autoRepeatCheckbox.addEventListener('click', function () {
    const wasChecked = this.checked;
    
    if (!wasChecked) {
        // 반복 해제 시 초기화
        completedCycles = 0;
        pomodoroCount = 0;
        localStorage.setItem('completedCycles', completedCycles);
        localStorage.setItem('pomodoroCount', pomodoroCount);
        
        // 타이머 초기 모드로 재설정
        switchMode('pomodoro'); // switchMode는 이미 타이머를 멈추고 시간을 초기화하는 로직이 있음
    }

    localStorage.setItem('autoRepeat', wasChecked);
    heartTracker.style.display = wasChecked ? 'flex' : 'none';
    updateHearts();
});

 function toggleOptions() {
    const panel = document.getElementById('optionsPanel');
    const savedMessages = JSON.parse(localStorage.getItem('userMessages') || '{}');
    document.getElementById('workDoneMessage').value = savedMessages.work || '작업 끝!';
    document.getElementById('breakDoneMessage').value = savedMessages.break || '휴식 끝!';

    if (panel.classList.contains('open')) {
        panel.style.maxHeight = '0';
        panel.classList.remove('open');
    } else {
        panel.classList.add('open');
        panel.style.maxHeight = panel.scrollHeight + 'px';
    }
}

  function toggleSection(id) {
    const section = document.getElementById(id);
    section.classList.toggle('visible');

    const panel = document.getElementById('optionsPanel');
    if (panel.classList.contains('open')) {
    panel.style.maxHeight = panel.scrollHeight + 'px';
    }
  }

  function showMessageBox(message) {
  const messageBox = document.getElementById('messageBox');
  const messageText = document.getElementById('messageText');
  messageText.innerHTML = message.replace(/\n/g, '<br>');
  messageBox.style.display = 'block';
  }

  function closeMessageBox() {
  const messageBox = document.getElementById('messageBox');
  messageBox.style.display = 'none';
  alarm.pause();
  alarm.currentTime = 0;

  const userTimes = JSON.parse(localStorage.getItem('userTimes') || '{}');
  let minutes;

  if (currentMode === 'pomodoro') {
    minutes = userTimes.pomodoro || 25;
  } else if (currentMode === 'short') {
    minutes = userTimes.short || 5;
  } else if (currentMode === 'long') {
    minutes = userTimes.long || 15;
  }

  timeLeft = minutes * 60;
  updateTimerDisplay();
  }

  function applyTheme(mode) {
  const body = document.body;
  body.classList.remove('dark-theme');

  let finalMode = mode;

  if (mode === 'dark') {
    body.classList.add('dark-theme');
  } else if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      body.classList.add('dark-theme');
      finalMode = 'dark';
    } else {
      finalMode = 'light';
    }
  }

  // data-theme 속성 설정
  document.documentElement.setAttribute('data-theme', finalMode);
}

// 실시간 컬러 설정을 위한 매핑(ColorPickers)
const colorMapping = {
    '--bg-color': 'bgColor',
    '--btn-color': 'btnColor',
    '--btn-hover-color': 'btnHoverColor',
    '--highlight-color': 'highlightColor',
    '--btn-text-color': 'btnTextColor',
    '--timer-color': 'timerColor',
    '--general-shadow-color': 'generalShadowColor',
    '--timer-shadow-color': 'timerShadowColor' 
};

// 2. 초기화 함수 정의 (이벤트 리스너를 설정)
function initializeColorPickers() {
    // colorMapping 객체를 사용하여 모든 색상 input에 리스너 설정
    for (const cssVar in colorMapping) {
        const inputId = colorMapping[cssVar];
        const inputElement = document.getElementById(inputId);

        if (inputElement) {
            inputElement.addEventListener('input', (e) => {
                const newColor = e.target.value;

                // 1. 실시간 CSS 변수 적용
                document.documentElement.style.setProperty(cssVar, newColor);
                
                // 2. localStorage에 저장
                const styles = JSON.parse(localStorage.getItem('userStyles') || '{}');
                styles[cssVar] = newColor;
                localStorage.setItem('userStyles', JSON.stringify(styles));
            });
        }
    }
}

// 프리셋 설정
function applyPreset(presetName) {
  const presetColors = {
    pink: {
      '--bg-color': '#FFD1DC',
      '--btn-color': '#FFFFFF',
      '--btn-hover-color': '#FFE4EC',
      '--highlight-color': '#FF6699',
      '--btn-text-color': '#FF6699',
      '--timer-color': '#FF3366',
      '--general-shadow-color': '#FFD1DC',
      '--timer-shadow-color': '#FFD1DC'
    },
    blue: {
      '--bg-color': '#D0E8FF',
      '--btn-color': '#FFFFFF',
      '--btn-hover-color': '#E0F0FF',
      '--highlight-color': '#3399FF',
      '--btn-text-color': '#3399FF',
      '--timer-color': '#0066CC',
      '--general-shadow-color': '#D0E8FF',
      '--timer-shadow-color': '#D0E8FF'
    },
    yellow: {
      '--bg-color': '#FFF9DB', 
      '--btn-color': '#FFECB3', 
      '--btn-hover-color': '#FFE082',
      '--highlight-color': '#FFC107', 
      '--btn-text-color': '#8D6E63', 
      '--timer-color': '#FFA000', 
      '--text-color': '#5C4033',
      '--general-shadow-color': '#8D6E63',
      '--timer-shadow-color': '#8D6E63'
      },
    green: {
      '--bg-color': '#D7EAD3',
      '--btn-color': '#3E6543',
      '--btn-hover-color': '#4C7A51',
      '--highlight-color': '#3E6543',
      '--btn-text-color': '#D7EAD3',
      '--timer-color': '#2C4B32',
      '--general-shadow-color': '#D7EAD3',
      '--timer-shadow-color': '#D7EAD3'
    },
    black: {
      '--bg-color': '#000000',
      '--btn-color': '#212121',
      '--btn-hover-color': '#333333',
      '--highlight-color': '#454545',
      '--btn-text-color': '#FFFFFF',
      '--timer-color': '#FFFFFF',
      '--text-color': '#000000',
      '--general-shadow-color': '#FFFFFF',
      '--timer-shadow-color': '#212121'
    },
    white: {
      '--bg-color': '#FFFFFF',
      '--btn-color': '#000000',
      '--btn-hover-color': '#CCCCCC',
      '--highlight-color': '#000000',
      '--btn-text-color': '#FFFFFF',
      '--timer-color': '#000000',
      '--general-shadow-color': '#FFFFFF',
      '--timer-shadow-color': '#FFFFFF'
    },
    pinkchoco: {
      '--bg-color': '#FFD1DC',
      '--btn-color': '#8B4513',
      '--btn-hover-color': '#A0522D',
      '--highlight-color': '#8B4513',
      '--btn-text-color': '#FFD1DC',
      '--timer-color': '#A0522D',
      '--general-shadow-color': '#FFD1DC',
      '--timer-shadow-color': '#FFD1DC'
    },
    tomato: {
      '--bg-color': '#FF6347',
      '--btn-color': '#228B22', 
      '--btn-hover-color': '#2E8B57', 
      '--highlight-color': '#228B22', 
      '--btn-text-color': '#FFFFFF',   
      '--timer-color': '#006400',      
      '--text-color': '#2E2E2E',
      '--general-shadow-color': '#FF6347',
      '--timer-shadow-color': '#FF6347'     
    },
    angel: {
      '--bg-color': '#FFFFFF',      
      '--btn-color': '#E7F3F8',    
      '--btn-hover-color': '#A0BACF', 
      '--highlight-color': '#94C6E0', 
      '--btn-text-color': '#5281AC',  
      '--timer-color': '#5084AC', 
      '--text-color': '#2E2E2E', 
      '--general-shadow-color': '#E7F3F8',
      '--timer-shadow-color': '#E7F3F8'  
      },
  };

  const colors = presetColors[presetName];
  if (!colors) return;

  const currentStyles = JSON.parse(localStorage.getItem('userStyles') || '{}');
  const mergedStyles = { ...currentStyles, ...colors };

  // 스타일 적용
  for (const variable in mergedStyles) {
    document.documentElement.style.setProperty(variable, mergedStyles[variable]);
  }

  // **Input 값들도 업데이트하기**
  const inputMapping = {
    '--bg-color': 'bgColor',
    '--btn-color': 'btnColor',
    '--btn-hover-color': 'btnHoverColor',
    '--highlight-color': 'highlightColor',
    '--btn-text-color': 'btnTextColor',
    '--timer-color': 'timerColor',
    '--btn-font-size': 'btnFontSize',
    '--timer-font-size': 'timerFontSize',
    '--general-shadow-color': 'generalShadowColor', 
    '--timer-shadow-color': 'timerShadowColor'
  };

  for (const variable in colors) {
    const inputId = inputMapping[variable];
    if (inputId) {
      const input = document.getElementById(inputId);
      if (input) {
        if (variable.includes('font-size')) {
          input.value = parseInt(colors[variable]);
        } else {
          input.value = colors[variable];
        }
      }
    }
  }

  localStorage.setItem('userStyles', JSON.stringify(mergedStyles));
  localStorage.setItem('selectedPreset', presetName);
}

// 테마 설정 저장 + 적용
function setTheme(mode) {
  if (mode === 'system') {
    localStorage.removeItem('themeMode');
  } else {
    localStorage.setItem('themeMode', mode);
  }
  applyTheme(mode);
}

// 다크/라이트 전환 버튼
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  
  if (currentTheme === 'dark') {
    setTheme('light');
  } else {
    setTheme('dark');
  }
  updateThemeToggleButton(); 
}

// 테마 상태에 따라 버튼 표시
function updateThemeToggleButton() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const themeButton = document.getElementById('themeToggleButton');
  
  themeButton.textContent = currentTheme === 'dark' ? '🖤' : '🤍';
}

  function applyOptions() {
  
    const styleInputs = {
    '--bg-color': 'bgColor',
    '--btn-color': 'btnColor',
    '--btn-hover-color': 'btnHoverColor',
    '--highlight-color': 'highlightColor',
    '--btn-text-color': 'btnTextColor',
    '--timer-color': 'timerColor',
    '--btn-font-size': 'btnFontSize',
    '--timer-font-size': 'timerFontSize',
    '--general-shadow-color': 'generalShadowColor', 
    '--timer-shadow-color': 'timerShadowColor'
    };

    let currentStyleMap = JSON.parse(localStorage.getItem('userStyles') || '{}');
    const updatedStyleMap = { ...currentStyleMap };

    let hasCustomChange = false;

for (const variable in styleInputs) {
  const input = document.getElementById(styleInputs[variable]);
  if (input) {
    let newValue;
    if (input.type === 'number') {
      let value = parseInt(input.value, 10);

      switch (variable) {
        case '--btn-font-size':
          value = Math.min(Math.max(value, 5), 80);
          input.value = value;
          break;
        case '--timer-font-size':
          value = Math.min(Math.max(value, 20), 200);
          input.value = value;
          break;
      }

      newValue = `${value}px`;
    } else {
      newValue = input.value;
    }

    if (currentStyleMap[variable] !== newValue) {
      updatedStyleMap[variable] = newValue;
      document.documentElement.style.setProperty(variable, newValue);
      hasCustomChange = true;
    }
  }
}

if (hasCustomChange) {
  if (!localStorage.getItem('selectedPreset')) {
    localStorage.removeItem('selectedPreset');
  }
}

  // 볼륨 설정 저장 
  localStorage.setItem('userVolume', volumeControl.value);

  // 시간 설정 저장
  const times = {
    pomodoro: parseInt(document.getElementById('pomodoroTime').value, 10),
    short: parseInt(document.getElementById('shortTime').value, 10),
    long: parseInt(document.getElementById('longTime').value, 10)
};

  // 메시지 입력값 가져오기
  let workMessage = document.getElementById('workDoneMessage').value.replace(/\r\n/g, '\n').slice(0, 30);
  let breakMessage = document.getElementById('breakDoneMessage').value.replace(/\r\n/g, '\n').slice(0, 30);

  const messages = {
    work: workMessage,
    break: breakMessage
  };

  localStorage.setItem('userStyles', JSON.stringify(updatedStyleMap));
  localStorage.setItem('userTimes', JSON.stringify(times));
  localStorage.setItem('userMessages', JSON.stringify(messages));

  resetTimer();
}

function loadUserStyles() {
    // 1. CSS 스타일 로드
    const styleMap = JSON.parse(localStorage.getItem('userStyles') || '{}');

    const defaultShadowStyles = {
        '--timer-shadow-color': '#FFFFFF',
        '--general-shadow-color': '#ffffffff'
    };
    
    const mergedStyles = { 
        ...defaultShadowStyles, 
        ...styleMap 
    };

    const mapping = {   
        '--bg-color': 'bgColor',
        '--btn-color': 'btnColor',
        '--btn-hover-color': 'btnHoverColor',
        '--highlight-color': 'highlightColor',
        '--btn-text-color': 'btnTextColor',
        '--timer-color': 'timerColor',
        '--btn-font-size': 'btnFontSize',
        '--timer-font-size': 'timerFontSize',
        '--general-shadow-color': 'generalShadowColor',
        '--timer-shadow-color': 'timerShadowColor'
    };

    const savedBgImage = localStorage.getItem('customBgImage');
    const savedMimeType = localStorage.getItem('customBgMimeType');
    const preserveBgColor = savedBgImage && (savedMimeType === 'image/png' || savedMimeType === 'image/webp');

    const timerBox = document.getElementById('timer-box');

    // 2. 타이머 박스(has-bg-image) 클래스 제어
    if (timerBox) {
        if (savedBgImage) {
            timerBox.classList.add('has-bg-image');
        } else {
            timerBox.classList.remove('has-bg-image');
        }
    }

    // 3. CSS 변수 복원 루프
    for (const variable in mergedStyles) {
        const value = mergedStyles[variable];
        // A. JPEG 배경 이미지 처리 (transparent 강제)
        if (savedBgImage && variable === '--bg-color' && !preserveBgColor) {
            document.documentElement.style.setProperty(variable, 'transparent'); // jpg면 배경색 투명화처리
            
            // 입력 필드 복원 (UI)
            const inputId = mapping[variable];
            if (inputId) {
                const input = document.getElementById(inputId);
                if (input) input.value = styleMap[variable];
            }
            continue; // 다른 처리를 건너뛰고 다음 변수로 이동
        }
        
        // B. 나머지 스타일 적용 (PNG 배경색 포함)
        document.documentElement.style.setProperty(variable, value);
        
        const inputId = mapping[variable];
        if (inputId) {
            const input = document.getElementById(inputId);
            if (input) {
                input.value = styleMap[variable].replace('px', '');
            }
        }
    }

    // 4. 배경 이미지 CSS 스타일 복원 (BODY에 단 한번만 실행)
    if (savedBgImage) {
        document.body.style.backgroundImage = `url('${savedBgImage}')`;
        document.body.style.backgroundSize = 'cover'; 
        document.body.style.backgroundPosition = 'center center'; 
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundRepeat = 'no-repeat';
    }

    // 2. 시간/메시지/볼륨 로드
    const times = JSON.parse(localStorage.getItem('userTimes') || '{}');
    const pomodoroInput = document.getElementById('pomodoroTime');
    if (pomodoroInput) pomodoroInput.value = times.pomodoro || 25;
    
    const shortInput = document.getElementById('shortTime');
    if (shortInput) shortInput.value = times.short || 5;
    
    const longInput = document.getElementById('longTime');
    if (longInput) longInput.value = times.long || 15;

    const messages = JSON.parse(localStorage.getItem('userMessages') || '{}');
    const workMsgInput = document.getElementById('workDoneMessage');
    if (workMsgInput) workMsgInput.value = messages.work || '작업 끝!';
    
    const breakMsgInput = document.getElementById('breakDoneMessage');
    if (breakMsgInput) breakMsgInput.value = messages.break || '휴식 끝!';

    const savedVolume = localStorage.getItem('userVolume');
    if (savedVolume !== null && typeof volumeControl !== 'undefined') {
        volumeControl.value = savedVolume;
        // alarm 객체가 있다면 볼륨 적용
        if (typeof alarm !== 'undefined') {
            alarm.volume = parseFloat(savedVolume);
        }
    }
}

  // pomodoroCount 복원
  pomodoroCount = parseInt(localStorage.getItem('pomodoroCount')) || 0;

  // 자동 반복 토글 상태 복원
  const autoRepeatSaved = localStorage.getItem('autoRepeat') === 'true';
  autoRepeatCheckbox.checked = autoRepeatSaved;
  heartTracker.style.display = autoRepeatSaved ? 'block' : 'none';

  completedCycles = parseInt(localStorage.getItem('completedCycles')) || 0;
  updateHearts();

  //저장 설정
  document.addEventListener('DOMContentLoaded', () => {
    // 1. 테마 로드
    const savedTheme = localStorage.getItem('themeMode') || 'system';
    applyTheme(savedTheme);
    updateThemeToggleButton();

    const savedPreset = localStorage.getItem('selectedPreset');
    const savedUserStyles = localStorage.getItem('userStyles');
    const presetListItems = document.querySelectorAll('.preset-list li');
    const autoRepeatCheckbox = document.getElementById('autoRepeatToggle');
    const heartTracker = document.getElementById('heartTracker');

    // 2. 배경 이미지 선택 관련 DOM 요소 (이벤트 리스너가 붙을 요소)
    const bgImageUpload = document.getElementById('bgImageUpload');
    const customBgImageButton = document.getElementById('customBgImageButton');
    const removeBgImageButton = document.getElementById('removeBgImageButton');

    customBgImageButton.addEventListener('click', () => {
        bgImageUpload.click();
    });

    bgImageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const mimeType = file.type; //파일 포맷 확인
        const outputMimeType = (mimeType === 'image/png' || mimeType === 'image/webp') ? mimeType : 'image/jpeg';

        const reader = new FileReader();
        
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                
                const MAX_WIDTH = 1920; // 최대 너비 설정
                const MAX_QUALITY = 0.8; // JPEG 품질
                
                const canvas = document.getElementById('resizeCanvas');
                const ctx = canvas.getContext('2d');
                
                let width = img.width;
                let height = img.height;

                // 1. 이미지 크기가 너무 크면 리사이징 비율 계산
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;

                if (outputMimeType !== 'image/jpeg') {
                    // PNG 또는 WebP는 캔버스에 배경색을 칠하지 않고 투명하게 유지
                    ctx.clearRect(0, 0, width, height); 
                }

                // 2. 캔버스에 이미지 그리기
                ctx.drawImage(img, 0, 0, width, height);

                // 3. JPEG 품질을 낮춰 Base64 데이터 추출 (용량 축소)
                const resizedImageUrl = canvas.toDataURL(outputMimeType, MAX_QUALITY);
                
                // 4. 배경 스타일 적용
                document.body.style.backgroundImage = `url('${resizedImageUrl}')`;
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center'; 
                document.body.style.backgroundAttachment = 'fixed'; 
                document.body.style.backgroundRepeat = 'no-repeat';

                if (outputMimeType === 'image/jpeg') {
                    // JPEG (투명도 없음): 기존처럼 배경색을 'transparent'로 강제하여 다른 배경색이 보이지 않게 막음
                    document.documentElement.style.setProperty('--bg-color', 'transparent'); 
                } else {
                    // PNG/WebP (투명도 있음): 배경색을 저장된 원래 색상으로 복원하여 투명 영역 뒤에 보이게 함
                    const userStyles = JSON.parse(localStorage.getItem('userStyles') || '{}');
                    const originalBgColor = userStyles['--bg-color'] || '#f0f0f0';
                    document.documentElement.style.setProperty('--bg-color', originalBgColor);
                }
                
                const timerBox = document.getElementById('timer-box'); // 요소 참조
                if (timerBox) {
                    timerBox.classList.add('has-bg-image'); // #timer-box에 클래스 추가
                }

                // localStorage 저장
                try {
                    localStorage.setItem('customBgImage', resizedImageUrl); 
                    localStorage.setItem('customBgMimeType', outputMimeType);
                } catch (e) {
                    alert('저장된 이미지의 용량이 10MB를 초과했습니다. 더 작은 이미지를 사용해주세요.');
                    console.error("LocalStorage save failed:", e);

                    document.body.style.backgroundImage = 'none'; // 이미지 제거
                    const timerBox = document.getElementById('timer-box'); // 요소 참조
                    if (timerBox) {
                        timerBox.classList.remove('has-bg-image'); // #timer-box에서 클래스 제거
                    }

                    localStorage.removeItem('customBgImage'); 
                    localStorage.removeItem('customBgMimeType');
                }
            };
            img.src = event.target.result; // DataURL을 이미지 객체에 로드
        };
        reader.readAsDataURL(file); // 파일 읽기 시작
    }
});

// 배경 이미지 삭제 이벤트 리스너
if (removeBgImageButton) {
    removeBgImageButton.addEventListener('click', () => {
        
        // 1. localStorage에서 이미지 데이터 제거
        localStorage.removeItem('customBgImage');

        // 2. body 인라인 스타일에서 배경 이미지 및 이미지 타입 정보 제거
        document.body.style.backgroundImage = 'none';
        localStorage.removeItem('customBgMimeType');

        const timerBox = document.getElementById('timer-box');
        if (timerBox) {
         timerBox.classList.remove('has-bg-image');
        }
        
        // 3. userStyles에서 저장된 원래 배경색으로 복원
        const userStyles = JSON.parse(localStorage.getItem('userStyles') || '{}');
        const originalBgColor = userStyles['--bg-color'] || '#f0f0f0'; // 기본값 설정
        
        document.documentElement.style.setProperty('--bg-color', originalBgColor);
        
        // 4. UI 초기화 (파일 입력 필드 값 초기화)
        document.getElementById('bgImageUpload').value = null;
    });
}

    // 3. 프리셋 클릭 이벤트 리스너 설정
    presetListItems.forEach(li => {
        li.addEventListener('click', () => {
            const presetName = li.getAttribute('data-preset');
            applyPreset(presetName);

            // 선택 강조 표시
            presetListItems.forEach(item => {
                item.classList.remove('selected');
            });
            li.classList.add('selected');
        });
    });

    // 4. 프리셋/사용자 스타일 및 시간/메시지/볼륨 로드
    if (savedPreset && savedUserStyles) {
        applyPreset(savedPreset);
        loadUserStyles(true); 

        // 선택된 프리셋 UI 강조 표시
        presetListItems.forEach(li => {
            if (li.getAttribute('data-preset') === savedPreset) {
                li.classList.add('selected');
            } else {
                li.classList.remove('selected');
            }
        });
    } else {
        loadUserStyles();
    }

    initializeColorPickers();

    // 5. 카운터 및 자동 반복 상태 복원
    pomodoroCount = parseInt(localStorage.getItem('pomodoroCount')) || 0;
    completedCycles = parseInt(localStorage.getItem('completedCycles')) || 0;

    const autoRepeatSaved = localStorage.getItem('autoRepeat') === 'true';
    if (autoRepeatCheckbox) {
        autoRepeatCheckbox.checked = autoRepeatSaved;
    }
    if (heartTracker) {
        heartTracker.style.display = autoRepeatSaved ? 'flex' : 'none';
    }
    
    // 6. 타이머 및 UI 최종 초기화
    switchMode('pomodoro'); // 초기 시간 설정 및 UI 업데이트 (resetTimer 포함)
    updateHearts();        // 로드된 카운트에 맞춰 하트 UI 업데이트
    updateStats();         // 통계 UI 업데이트
    
    // 7. 시스템 테마 변경 감지
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
        const currentTheme = localStorage.getItem('themeMode') || 'system';
        if (currentTheme === 'system') {
            applyTheme('system');
        }
    });
});