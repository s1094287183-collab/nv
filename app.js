// Firebase 配置
const firebaseConfig = {
    apiKey: "AIzaSyAfJlwD2WNyEjWi9P_xtyIJgPd8mkf0fJQ",
    authDomain: "our-secret-172a7.firebaseapp.com",
    databaseURL: "https://our-secret-172a7-default-rtdb.firebaseio.com",
    projectId: "our-secret-172a7",
    storageBucket: "our-secret-172a7.firebasestorage.app",
    messagingSenderId: "370805742187",
    appId: "1:370805742187:web:031b2a39cf42d5dd6d6f2e"
};

// 全局变量
let db, coupleId, userId;
let peer, localStream;
let currentCall = null;
let isMuted = false;
let periodData = {
    records: [],
    cycle: 28,
    currentPeriod: null
};

// ==================== 初始化 ====================

window.onload = function() {
    // 初始化 Firebase
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();

    // 检查配置
    coupleId = localStorage.getItem('coupleId');
    if (!coupleId) {
        showSetupScreen();
        return;
    }

    // 生成/获取用户ID
    userId = localStorage.getItem('userId');
    if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userId', userId);
    }

    // 显示主应用
    showMainApp();

    // 初始化功能
    initOnlineStatus();
    loadMessages();
    loadInteractions();
    initVideoCall();
    initEventListeners();
    loadPeriodData();
};

// 显示设置界面
function showSetupScreen() {
    document.getElementById('setupScreen').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
}

// 显示主应用
function showMainApp() {
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
}

// 保存专属ID
function saveCoupleId() {
    const input = document.getElementById('coupleIdInput');
    const id = input.value.trim();

    if (!id) {
        alert('请输入专属ID！');
        return;
    }

    if (id.length < 3) {
        alert('ID太短了，至少3个字符！');
        return;
    }

    if (!/^[a-zA-Z0-9\-_]+$/.test(id)) {
        alert('ID只能包含字母、数字、横线和下划线！');
        return;
    }

    // 保存
    localStorage.setItem('coupleId', id);
    coupleId = id;

    // 生成用户ID
    userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('userId', userId);

    // 重新加载
    location.reload();
}

// ==================== 事件监听 ====================

function initEventListeners() {
    // 标签页切换
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    // 互动按钮
    document.querySelectorAll('.interaction-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.getAttribute('data-type');
            const label = this.getAttribute('data-label');
            sendInteraction(type, label);
        });
    });

    // 回车发送消息
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
}

// 标签页切换
function switchTab(tabName) {
    // 移除所有active
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    // 添加active
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
}

// ==================== 在线状态 ====================

function initOnlineStatus() {
    const onlineRef = db.ref(`couples/${coupleId}/online/${userId}`);
    const partnerRef = db.ref(`couples/${coupleId}/online`);

    // 设置自己在线
    onlineRef.set({
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        userId: userId
    });

    // 断线时移除
    onlineRef.onDisconnect().remove();

    // 监听对方状态
    partnerRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const partners = Object.keys(data).filter(id => id !== userId);
            updateOnlineStatus(partners.length > 0);
        } else {
            updateOnlineStatus(false);
        }
    });

    // 定期更新心跳
    setInterval(() => {
        onlineRef.set({
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            userId: userId
        });
    }, 30000);
}

function updateOnlineStatus(isOnline) {
    const statusEl = document.getElementById('onlineStatus');
    if (isOnline) {
        statusEl.innerHTML = '<div class="online-dot"></div><span>Ta在线 ❤️</span>';
        statusEl.style.background = 'rgba(16, 185, 129, 0.2)';
        statusEl.style.color = '#10b981';
    } else {
        statusEl.innerHTML = '<div class="online-dot" style="background: #999; animation: none;"></div><span>Ta离线</span>';
        statusEl.style.background = 'rgba(156, 163, 175, 0.2)';
        statusEl.style.color = '#9ca3af';
    }
}

// ==================== 生理期功能 ====================

// SVG图标定义
const statusIcons = {
    // 经期中 - 卫生巾图标
    period: `
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="periodGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#ff69b4;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#ff1493;stop-opacity:1" />
                </linearGradient>
            </defs>
            <!-- 卫生巾外形 -->
            <ellipse cx="100" cy="100" rx="60" ry="80" fill="url(#periodGradient)" opacity="0.9"/>
            <ellipse cx="100" cy="100" rx="50" ry="70" fill="white" opacity="0.3"/>
            <!-- 装饰线条 -->
            <path d="M 70 60 Q 100 80 130 60" stroke="white" stroke-width="3" fill="none" opacity="0.5"/>
            <path d="M 70 100 Q 100 120 130 100" stroke="white" stroke-width="3" fill="none" opacity="0.5"/>
            <path d="M 70 140 Q 100 160 130 140" stroke="white" stroke-width="3" fill="none" opacity="0.5"/>
        </svg>
    `,
    
    // 安全期 - 床上情侣图标（更真实）
    safe: `
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="safeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#059669;stop-opacity:1" />
                </linearGradient>
                <linearGradient id="bedGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#8b5cf6;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#6d28d9;stop-opacity:1" />
                </linearGradient>
            </defs>
            
            <!-- 绿色安全背景光晕 -->
            <circle cx="100" cy="100" r="85" fill="url(#safeGradient)" opacity="0.2"/>
            <circle cx="100" cy="100" r="70" fill="url(#safeGradient)" opacity="0.15"/>
            
            <!-- 床铺 -->
            <rect x="30" y="110" width="140" height="50" rx="10" fill="url(#bedGradient)" opacity="0.8"/>
            <rect x="30" y="105" width="140" height="15" rx="8" fill="#a78bfa" opacity="0.6"/>
            
            <!-- 被子/毯子 -->
            <path d="M 35 120 Q 100 110 165 120 L 165 155 Q 100 165 35 155 Z" 
                  fill="#c4b5fd" opacity="0.7"/>
            
            <!-- 男性（左侧，蓝色） -->
            <circle cx="70" cy="100" r="18" fill="#3b82f6" opacity="0.9"/>
            <ellipse cx="70" cy="125" rx="22" ry="15" fill="#3b82f6" opacity="0.8"/>
            <path d="M 52 125 Q 48 135 52 145" stroke="#2563eb" stroke-width="6" 
                  fill="none" stroke-linecap="round" opacity="0.8"/>
            
            <!-- 女性（右侧，粉色） -->
            <circle cx="130" cy="100" r="18" fill="#ec4899" opacity="0.9"/>
            <ellipse cx="130" cy="125" rx="22" ry="15" fill="#ec4899" opacity="0.8"/>
            <!-- 女性长发 -->
            <path d="M 115 95 Q 110 105 115 115" stroke="#ec4899" stroke-width="8" 
                  fill="none" stroke-linecap="round" opacity="0.7"/>
            <path d="M 145 95 Q 150 105 145 115" stroke="#ec4899" stroke-width="8" 
                  fill="none" stroke-linecap="round" opacity="0.7"/>
            
            <!-- 亲密姿态 - 靠在一起 -->
            <path d="M 88 110 Q 100 108 112 110" stroke="#fff" stroke-width="3" 
                  fill="none" opacity="0.6"/>
            
            <!-- 爱心符号（顶部） -->
            <path d="M100,65 C85,50 65,50 55,65 C45,80 55,95 100,120 C145,95 155,80 145,65 C135,50 115,50 100,65 Z" 
                  fill="#10b981" opacity="0.4"/>
            
            <!-- 环境装饰 - 星星 -->
            <circle cx="40" cy="70" r="3" fill="#fbbf24" opacity="0.7">
                <animate attributeName="opacity" values="0.7;0.3;0.7" dur="2s" repeatCount="indefinite"/>
            </circle>
            <circle cx="160" cy="70" r="3" fill="#fbbf24" opacity="0.7">
                <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite"/>
            </circle>
            <circle cx="100" cy="50" r="3" fill="#fbbf24" opacity="0.7">
                <animate attributeName="opacity" values="0.5;0.9;0.5" dur="2s" repeatCount="indefinite"/>
            </circle>
        </svg>
    `,
    
    // 排卵期 - 卵子图标
    ovulation: `
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="ovulationGradient">
                    <stop offset="0%" style="stop-color:#fbbf24;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#f59e0b;stop-opacity:1" />
                </radialGradient>
            </defs>
            <!-- 卵子主体 -->
            <circle cx="100" cy="100" r="45" fill="url(#ovulationGradient)" opacity="0.9"/>
            <circle cx="100" cy="100" r="35" fill="#fff" opacity="0.3"/>
            <!-- 细胞核 -->
            <circle cx="100" cy="100" r="20" fill="#f59e0b" opacity="0.6"/>
            <!-- 光晕效果 -->
            <circle cx="100" cy="100" r="55" fill="none" stroke="#fbbf24" stroke-width="2" opacity="0.4"/>
            <circle cx="100" cy="100" r="65" fill="none" stroke="#fbbf24" stroke-width="1" opacity="0.2"/>
            <!-- 装饰星星 -->
            <path d="M 100 50 L 103 60 L 113 60 L 105 67 L 108 77 L 100 70 L 92 77 L 95 67 L 87 60 L 97 60 Z" 
                  fill="#fbbf24" opacity="0.6"/>
        </svg>
    `,
    
    // 即将来临 - 警告图标
    premenstrual: `
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="preGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#ef4444;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#dc2626;stop-opacity:1" />
                </linearGradient>
            </defs>
            <!-- 警告三角形 -->
            <path d="M 100 30 L 170 150 L 30 150 Z" fill="url(#preGradient)" opacity="0.9"/>
            <path d="M 100 40 L 160 145 L 40 145 Z" fill="#fff" opacity="0.2"/>
            <!-- 感叹号 -->
            <rect x="95" y="70" width="10" height="45" rx="5" fill="white"/>
            <circle cx="100" cy="130" r="7" fill="white"/>
            <!-- 脉冲圆环 -->
            <circle cx="100" cy="100" r="75" fill="none" stroke="#ef4444" stroke-width="2" opacity="0.3">
                <animate attributeName="r" from="75" to="85" dur="1.5s" repeatCount="indefinite"/>
                <animate attributeName="opacity" from="0.3" to="0" dur="1.5s" repeatCount="indefinite"/>
            </circle>
        </svg>
    `,
    
    // 未知状态 - 问号图标
    unknown: `
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="unknownGradient">
                    <stop offset="0%" style="stop-color:#9ca3af;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#6b7280;stop-opacity:1" />
                </linearGradient>
            </defs>
            <!-- 圆形背景 -->
            <circle cx="100" cy="100" r="60" fill="url(#unknownGradient)" opacity="0.8"/>
            <circle cx="100" cy="100" r="50" fill="white" opacity="0.2"/>
            <!-- 问号 -->
            <path d="M 85 75 Q 85 60 100 60 Q 115 60 115 75 Q 115 85 100 90 L 100 105" 
                  stroke="white" stroke-width="8" fill="none" stroke-linecap="round"/>
            <circle cx="100" cy="125" r="6" fill="white"/>
        </svg>
    `
};

function loadPeriodData() {
    const periodRef = db.ref(`couples/${coupleId}/period`);
    
    periodRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            periodData = data;
        }
        
        updatePeriodStatus();
        updatePeriodHistory();
        updateCareTips();
    });
}

function updatePeriodStatus() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 状态配置
    const statusConfig = {
        period: {
            icon: 'period',
            title: '经期中',
            color: '#ff69b4',
            bgGradient: 'linear-gradient(135deg, rgba(255, 105, 180, 0.3), rgba(255, 20, 147, 0.3))',
            tips: ['注意保暖', '多喝热水', '避免剧烈运动', '充足休息']
        },
        safe: {
            icon: 'safe',
            title: '安全期',
            color: '#10b981',
            bgGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.3))',
            tips: ['保持健康生活', '适度运动', '均衡饮食']
        },
        ovulation: {
            icon: 'ovulation',
            title: '排卵期',
            color: '#f59e0b',
            bgGradient: 'linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(245, 158, 11, 0.3))',
            tips: ['注意身体变化', '保持好心情', '适当运动']
        },
        premenstrual: {
            icon: 'premenstrual',
            title: '即将来临',
            color: '#ef4444',
            bgGradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.3))',
            tips: ['准备用品', '注意情绪', '避免生冷食物', '保持温暖']
        },
        unknown: {
            icon: 'unknown',
            title: '未知状态',
            color: '#9ca3af',
            bgGradient: 'linear-gradient(135deg, rgba(156, 163, 175, 0.3), rgba(107, 114, 128, 0.3))',
            tips: ['请记录经期开始日期']
        }
    };

    let currentStatus = 'unknown';
    let daysText = '';
    let statusText = '暂无数据，请记录经期开始时间';

    // 检查是否正在经期
    if (periodData.currentPeriod && periodData.currentPeriod.startDate) {
        const startDate = new Date(periodData.currentPeriod.startDate);
        startDate.setHours(0, 0, 0, 0);
        const daysSinceStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
        
        if (!periodData.currentPeriod.endDate) {
            // 正在经期中
            currentStatus = 'period';
            const periodDay = daysSinceStart + 1;
            daysText = `第 ${periodDay} 天`;
            statusText = '经期进行中，注意休息和保暖';
        }
    }

    // 计算下次经期
    if (periodData.records && periodData.records.length > 0 && currentStatus !== 'period') {
        const lastRecord = periodData.records[periodData.records.length - 1];
        const lastStartDate = new Date(lastRecord.startDate);
        lastStartDate.setHours(0, 0, 0, 0);
        
        const cycleLength = periodData.cycle || 28;
        const nextPeriodDate = new Date(lastStartDate);
        nextPeriodDate.setDate(nextPeriodDate.getDate() + cycleLength);
        
        const daysUntilNext = Math.floor((nextPeriodDate - today) / (1000 * 60 * 60 * 24));
        const daysSinceLastPeriod = Math.floor((today - lastStartDate) / (1000 * 60 * 60 * 24));
        
        if (daysUntilNext <= 0) {
            // 已经过了预计日期
            currentStatus = 'premenstrual';
            daysText = `延迟 ${Math.abs(daysUntilNext)} 天`;
            statusText = '经期可能即将开始';
        } else if (daysUntilNext <= 3) {
            // 即将来临
            currentStatus = 'premenstrual';
            daysText = `${daysUntilNext} 天后`;
            statusText = `预计 ${daysUntilNext} 天后来经期`;
        } else if (daysSinceLastPeriod >= Math.floor(cycleLength / 2 - 2) && 
                   daysSinceLastPeriod <= Math.floor(cycleLength / 2 + 2)) {
            // 排卵期
            currentStatus = 'ovulation';
            daysText = `${daysUntilNext} 天后`;
            statusText = `排卵期，距离下次经期还有 ${daysUntilNext} 天`;
        } else {
            // 安全期
            currentStatus = 'safe';
            daysText = `${daysUntilNext} 天后`;
            statusText = `距离下次经期还有 ${daysUntilNext} 天`;
        }
    }

    // 更新UI
    const config = statusConfig[currentStatus];
    
    // 更新SVG图标
    const iconContainer = document.getElementById('statusIconContainer');
    iconContainer.innerHTML = statusIcons[config.icon];
    
    document.getElementById('statusTitle').textContent = config.title;
    document.getElementById('statusText').textContent = statusText;
    document.getElementById('statusDays').textContent = daysText;
    
    const statusCard = document.getElementById('periodStatusCard');
    statusCard.style.background = config.bgGradient;
    statusCard.style.borderColor = config.color + '80';
}

function updatePeriodHistory() {
    const historyEl = document.getElementById('periodHistory');
    
    if (!periodData.records || periodData.records.length === 0) {
        historyEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><div>还没有记录</div></div>';
        return;
    }

    const html = periodData.records.slice().reverse().slice(0, 10).map((record, reverseIndex) => {
        const actualIndex = periodData.records.length - 1 - reverseIndex;
        const startDate = new Date(record.startDate);
        const dateStr = `${startDate.getMonth() + 1}月${startDate.getDate()}日`;
        
        let durationText = '';
        if (record.endDate) {
            const endDate = new Date(record.endDate);
            const duration = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            durationText = `${duration}天`;
        } else {
            durationText = '进行中';
        }

        return `
            <div class="history-item">
                <div class="history-date">
                    <div class="history-icon">📅</div>
                    <div class="history-info">
                        <div class="history-label">开始日期</div>
                        <div class="history-value">${dateStr}</div>
                    </div>
                </div>
                <div class="history-duration">${durationText}</div>
                <div class="history-actions">
                    <button class="edit-btn" onclick="editPeriodRecord(${actualIndex})" title="编辑">
                        ✏️
                    </button>
                    <button class="delete-btn" onclick="deletePeriodRecord(${actualIndex})" title="删除">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }).join('');

    historyEl.innerHTML = html;
}

// 编辑记录相关变量
let editingRecordIndex = -1;

// 打开编辑弹窗
function editPeriodRecord(index) {
    editingRecordIndex = index;
    const record = periodData.records[index];
    
    // 格式化日期为 YYYY-MM-DD
    const startDate = new Date(record.startDate);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    document.getElementById('editStartDate').value = startDateStr;
    
    if (record.endDate) {
        const endDate = new Date(record.endDate);
        const endDateStr = endDate.toISOString().split('T')[0];
        document.getElementById('editEndDate').value = endDateStr;
    } else {
        document.getElementById('editEndDate').value = '';
    }
    
    document.getElementById('editPeriodModal').style.display = 'flex';
}

// 关闭编辑弹窗
function closeEditPeriod() {
    document.getElementById('editPeriodModal').style.display = 'none';
    editingRecordIndex = -1;
}

// 保存编辑的记录
function saveEditedPeriod() {
    const startDateStr = document.getElementById('editStartDate').value;
    const endDateStr = document.getElementById('editEndDate').value;
    
    if (!startDateStr) {
        alert('请选择开始日期！');
        return;
    }
    
    // 验证日期
    const startDate = new Date(startDateStr);
    startDate.setHours(0, 0, 0, 0);
    
    if (endDateStr) {
        const endDate = new Date(endDateStr);
        endDate.setHours(0, 0, 0, 0);
        
        if (endDate < startDate) {
            alert('结束日期不能早于开始日期！');
            return;
        }
        
        // 检查日期跨度是否合理（不超过15天）
        const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
        if (daysDiff > 15) {
            if (!confirm(`经期持续${daysDiff + 1}天，确认无误吗？`)) {
                return;
            }
        }
    }
    
    if (confirm('确认保存修改吗？')) {
        // 更新记录
        periodData.records[editingRecordIndex] = {
            startDate: startDate.toISOString(),
            endDate: endDateStr ? new Date(endDateStr + 'T00:00:00').toISOString() : null
        };
        
        // 如果是最后一条记录且没有结束日期，更新 currentPeriod
        if (editingRecordIndex === periodData.records.length - 1 && !endDateStr) {
            periodData.currentPeriod = {
                startDate: startDate.toISOString(),
                endDate: null
            };
        } else if (editingRecordIndex === periodData.records.length - 1 && periodData.currentPeriod) {
            // 如果添加了结束日期，清除 currentPeriod
            periodData.currentPeriod = null;
        }
        
        savePeriodData().then(() => {
            showNotification('✅ 记录已更新');
            closeEditPeriod();
        });
    }
}

// 删除当前编辑的记录
function deleteCurrentPeriod() {
    if (confirm('确定要删除这条记录吗？\n\n删除后无法恢复！')) {
        // 删除记录
        periodData.records.splice(editingRecordIndex, 1);
        
        // 如果删除的是最后一条，清除 currentPeriod
        if (editingRecordIndex === periodData.records.length && periodData.currentPeriod) {
            periodData.currentPeriod = null;
        }
        
        savePeriodData().then(() => {
            showNotification('✅ 记录已删除');
            closeEditPeriod();
        });
    }
}

// 直接删除记录（从历史列表）
function deletePeriodRecord(index) {
    if (confirm('确定要删除这条记录吗？\n\n删除后无法恢复！')) {
        periodData.records.splice(index, 1);
        
        // 如果删除的是最后一条，清除 currentPeriod
        if (index === periodData.records.length && periodData.currentPeriod) {
            periodData.currentPeriod = null;
        }
        
        savePeriodData().then(() => {
            showNotification('✅ 记录已删除');
        });
    }
}

function updateCareTips() {
    const tipsEl = document.getElementById('careTips');
    
    // 根据当前状态生成提醒
    const tips = [
        {
            icon: '💧',
            title: '多喝温水',
            text: '每天至少8杯水，促进新陈代谢'
        },
        {
            icon: '🌡️',
            title: '注意保暖',
            text: '避免受凉，特别是腹部和脚部'
        },
        {
            icon: '🍎',
            title: '均衡饮食',
            text: '多吃新鲜水果蔬菜，避免生冷辛辣'
        },
        {
            icon: '😴',
            title: '充足睡眠',
            text: '保证每天7-8小时睡眠，早睡早起'
        },
        {
            icon: '🧘',
            title: '适度运动',
            text: '散步、瑜伽等轻度运动，避免剧烈运动'
        },
        {
            icon: '😊',
            title: '保持心情',
            text: '放松心情，避免情绪波动和压力'
        }
    ];

    const html = tips.map(tip => `
        <div class="care-tip-item">
            <div class="tip-icon">${tip.icon}</div>
            <div class="tip-content">
                <div class="tip-title">${tip.title}</div>
                <div class="tip-text">${tip.text}</div>
            </div>
        </div>
    `).join('');

    tipsEl.innerHTML = html;
}

// ==================== 记录经期开始/结束（手动选择日期）====================

// 显示记录开始弹窗
function showRecordStartModal() {
    // 检查是否已经在经期中
    if (periodData.currentPeriod && !periodData.currentPeriod.endDate) {
        if (!confirm('当前已经在记录经期中！\n\n是否要重新开始记录？\n（会覆盖当前记录）')) {
            return;
        }
    }

    // 设置默认日期为今天
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    document.getElementById('recordStartDate').value = dateStr;
    
    document.getElementById('recordStartModal').style.display = 'flex';
}

// 关闭记录开始弹窗
function closeRecordStart() {
    document.getElementById('recordStartModal').style.display = 'none';
}

// 快速设置今天
function setStartDateToday() {
    const today = new Date();
    document.getElementById('recordStartDate').value = today.toISOString().split('T')[0];
}

// 快速设置昨天
function setStartDateYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    document.getElementById('recordStartDate').value = yesterday.toISOString().split('T')[0];
}

// 快速设置前天
function setStartDateDayBefore() {
    const dayBefore = new Date();
    dayBefore.setDate(dayBefore.getDate() - 2);
    document.getElementById('recordStartDate').value = dayBefore.toISOString().split('T')[0];
}

// 确认记录开始
function confirmRecordStart() {
    const dateStr = document.getElementById('recordStartDate').value;
    
    if (!dateStr) {
        alert('请选择开始日期！');
        return;
    }

    const startDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 检查日期是否在未来
    if (startDate > today) {
        if (!confirm('您选择的日期是未来的日期，确定吗？')) {
            return;
        }
    }
    
    // 检查是否太久以前（超过60天）
    const daysDiff = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    if (daysDiff > 60) {
        if (!confirm(`您选择的日期是${daysDiff}天前，确定吗？`)) {
            return;
        }
    }

    const newPeriod = {
        startDate: startDate.toISOString(),
        endDate: null
    };

    periodData.currentPeriod = newPeriod;
    
    savePeriodData().then(() => {
        const displayDate = `${startDate.getMonth() + 1}月${startDate.getDate()}日`;
        showNotification(`✅ 已记录经期开始（${displayDate}）`);
        closeRecordStart();
        
        // 发送互动通知
        sendInteraction('period-start', '🌸 她的经期开始了');
    });
}

// 显示记录结束弹窗
function showRecordEndModal() {
    if (!periodData.currentPeriod || periodData.currentPeriod.endDate) {
        alert('当前没有正在进行的经期记录！\n\n请先点击"记录经期开始"');
        return;
    }

    // 显示当前开始日期
    const startDate = new Date(periodData.currentPeriod.startDate);
    const startDateStr = `${startDate.getMonth() + 1}月${startDate.getDate()}日`;
    document.getElementById('currentStartDate').textContent = startDateStr;
    document.getElementById('currentPeriodInfo').style.display = 'flex';
    
    // 设置默认日期为今天
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    document.getElementById('recordEndDate').value = dateStr;
    
    document.getElementById('recordEndModal').style.display = 'flex';
}

// 关闭记录结束弹窗
function closeRecordEnd() {
    document.getElementById('recordEndModal').style.display = 'none';
}

// 快速设置结束日期-今天
function setEndDateToday() {
    const today = new Date();
    document.getElementById('recordEndDate').value = today.toISOString().split('T')[0];
}

// 快速设置结束日期-昨天
function setEndDateYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    document.getElementById('recordEndDate').value = yesterday.toISOString().split('T')[0];
}

// 快速设置结束日期-前天
function setEndDateDayBefore() {
    const dayBefore = new Date();
    dayBefore.setDate(dayBefore.getDate() - 2);
    document.getElementById('recordEndDate').value = dayBefore.toISOString().split('T')[0];
}

// 确认记录结束
function confirmRecordEnd() {
    const dateStr = document.getElementById('recordEndDate').value;
    
    if (!dateStr) {
        alert('请选择结束日期！');
        return;
    }
    
    const endDate = new Date(dateStr + 'T00:00:00');
    const startDate = new Date(periodData.currentPeriod.startDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    
    // 检查结束日期是否早于开始日期
    if (endDate < startDate) {
        alert('结束日期不能早于开始日期！');
        return;
    }
    
    // 检查持续天数是否合理
    const duration = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    if (duration > 15) {
        if (!confirm(`经期持续${duration}天，确认无误吗？`)) {
            return;
        }
    }
    
    periodData.currentPeriod.endDate = endDate.toISOString();
    
    // 添加到历史记录
    if (!periodData.records) {
        periodData.records = [];
    }
    periodData.records.push({
        startDate: periodData.currentPeriod.startDate,
        endDate: periodData.currentPeriod.endDate
    });

    periodData.currentPeriod = null;

    savePeriodData().then(() => {
        const displayDate = `${endDate.getMonth() + 1}月${endDate.getDate()}日`;
        showNotification(`✅ 已记录经期结束（${displayDate}，共${duration}天）`);
        closeRecordEnd();
        
        // 发送互动通知
        sendInteraction('period-end', '💚 她的经期结束了');
    });
}

// 旧的函数保留作为兼容（快速记录今天）
function recordPeriodStart() {
    showRecordStartModal();
}

function recordPeriodEnd() {
    showRecordEndModal();
}

function updateCycle(value) {
    document.getElementById('cycleValue').textContent = value + '天';
    periodData.cycle = parseInt(value);
    savePeriodData();
}

function savePeriodData() {
    const periodRef = db.ref(`couples/${coupleId}/period`);
    return periodRef.set(periodData).then(() => {
        console.log('✅ 生理期数据已保存');
    }).catch((error) => {
        console.error('❌ 保存失败:', error);
        showNotification('保存失败，请重试');
    });
}

// ==================== 互动功能 ====================

function sendInteraction(type, label) {
    const interactionRef = db.ref(`couples/${coupleId}/interactions`).push();
    interactionRef.set({
        type: type,
        label: label,
        from: userId,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        showNotification(`已发送：${label} 💕`);
        createHearts();
    }).catch((error) => {
        console.error('发送失败:', error);
        showNotification('发送失败，请重试');
    });
}

function loadInteractions() {
    const interactionsRef = db.ref(`couples/${coupleId}/interactions`).limitToLast(10);
    interactionsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        const listEl = document.getElementById('recentInteractions');
        
        if (!data) {
            listEl.textContent = '暂无互动记录';
            return;
        }

        const interactions = Object.values(data).reverse();
        const html = interactions.map(item => {
            const time = new Date(item.timestamp).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const who = item.from === userId ? '你' : 'Ta';
            return `<div>${item.label} · ${who} · ${time}</div>`;
        }).join('');

        listEl.innerHTML = html;
    });
}

// 创建飘心动画
function createHearts() {
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const heart = document.createElement('div');
            heart.textContent = '❤️';
            heart.style.position = 'fixed';
            heart.style.left = Math.random() * window.innerWidth + 'px';
            heart.style.top = window.innerHeight + 'px';
            heart.style.fontSize = '30px';
            heart.style.animation = 'floatHeart 3s ease-out forwards';
            heart.style.pointerEvents = 'none';
            heart.style.zIndex = '9999';
            document.body.appendChild(heart);

            setTimeout(() => heart.remove(), 3000);
        }, i * 100);
    }
}

// 添加飘心动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes floatHeart {
        to {
            transform: translateY(-${window.innerHeight + 100}px) translateX(${Math.random() * 200 - 100}px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ==================== 留言功能 ====================

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    if (!text) {
        alert('请输入留言内容');
        return;
    }

    const messageRef = db.ref(`couples/${coupleId}/messages`).push();
    messageRef.set({
        text: text,
        from: userId,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        input.value = '';
        showNotification('留言已发送 💌');
    }).catch((error) => {
        console.error('发送失败:', error);
        showNotification('发送失败，请重试');
    });
}

function loadMessages() {
    const messagesRef = db.ref(`couples/${coupleId}/messages`).limitToLast(50);
    messagesRef.on('value', (snapshot) => {
        const data = snapshot.val();
        const listEl = document.getElementById('messagesList');

        if (!data) {
            listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💌</div><div>还没有留言</div></div>';
            return;
        }

        const messages = Object.values(data);
        const html = messages.map(msg => {
            const isMine = msg.from === userId;
            const time = new Date(msg.timestamp).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `<div class="message-item ${isMine ? 'mine' : 'theirs'}">
                <div class="message-sender">${isMine ? '我' : 'Ta'}</div>
                <div class="message-text">${escapeHtml(msg.text)}</div>
                <div class="message-time">${time}</div>
            </div>`;
        }).join('');

        listEl.innerHTML = html;
        listEl.scrollTop = listEl.scrollHeight;
    });
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== 视频通话 ====================

function initVideoCall() {
    try {
        peer = new Peer(userId, {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        peer.on('open', (id) => {
            console.log('PeerJS ID:', id);
            db.ref(`couples/${coupleId}/peerIds/${userId}`).set(id);
        });

        peer.on('call', (call) => {
            if (confirm('Ta想和你视频通话，接听吗？💕')) {
                answerCall(call);
            } else {
                call.close();
            }
        });

        peer.on('error', (err) => {
            console.error('PeerJS Error:', err);
        });
    } catch (error) {
        console.error('初始化视频通话失败:', error);
    }
}

async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        document.getElementById('localVideo').srcObject = localStream;

        const snapshot = await db.ref(`couples/${coupleId}/peerIds`).once('value');
        const peerIds = snapshot.val();
        
        if (!peerIds) {
            alert('对方不在线，无法发起通话');
            stopLocalStream();
            return;
        }

        const partnerIds = Object.keys(peerIds).filter(id => id !== userId);

        if (partnerIds.length === 0) {
            alert('对方不在线，无法发起通话');
            stopLocalStream();
            return;
        }

        const partnerId = peerIds[partnerIds[0]];
        currentCall = peer.call(partnerId, localStream);

        currentCall.on('stream', (remoteStream) => {
            document.getElementById('remoteVideo').srcObject = remoteStream;
            showVideoUI();
            showNotification('通话已接通 📞');
        });

        currentCall.on('close', () => {
            hangUp();
        });

    } catch (err) {
        console.error('获取媒体失败:', err);
        alert('无法访问摄像头/麦克风\n\n请确保已授予权限！');
        stopLocalStream();
    }
}

async function answerCall(call) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        document.getElementById('localVideo').srcObject = localStream;
        call.answer(localStream);
        currentCall = call;

        call.on('stream', (remoteStream) => {
            document.getElementById('remoteVideo').srcObject = remoteStream;
            showVideoUI();
            showNotification('通话已接通 📞');
        });

        call.on('close', () => {
            hangUp();
        });

    } catch (err) {
        console.error('接听失败:', err);
        alert('无法访问摄像头/麦克风');
    }
}

function hangUp() {
    if (currentCall) {
        currentCall.close();
        currentCall = null;
    }
    stopLocalStream();
    hideVideoUI();
    showNotification('通话已结束');
}

function stopLocalStream() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
}

function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isMuted = !audioTrack.enabled;
            const btn = event.target.closest('.video-btn');
            btn.textContent = isMuted ? '🔇' : '🎤';
        }
    }
}

function showVideoUI() {
    document.getElementById('callInterface').style.display = 'none';
    document.getElementById('videoContainer').style.display = 'block';
}

function hideVideoUI() {
    document.getElementById('callInterface').style.display = 'block';
    document.getElementById('videoContainer').style.display = 'none';
    document.getElementById('localVideo').srcObject = null;
    document.getElementById('remoteVideo').srcObject = null;
}

// ==================== 设置 ====================

function showSettings() {
    document.getElementById('currentCoupleId').textContent = coupleId;
    document.getElementById('currentUserId').textContent = userId;
    document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

function resetCoupleId() {
    if (confirm('确定要更改专属ID吗？\n\n更改后需要重新输入才能和对方同步数据。')) {
        localStorage.removeItem('coupleId');
        localStorage.removeItem('userId');
        location.reload();
    }
}

// ==================== 通知 ====================

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// ==================== 错误处理 ====================

window.addEventListener('error', (e) => {
    console.error('全局错误:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('未处理的Promise:', e.reason);
});
