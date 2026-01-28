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
            icon: '🌸',
            title: '经期中',
            color: '#ff69b4',
            tips: ['注意保暖', '多喝热水', '避免剧烈运动', '充足休息']
        },
        safe: {
            icon: '💚',
            title: '安全期',
            color: '#10b981',
            tips: ['保持健康生活', '适度运动', '均衡饮食']
        },
        ovulation: {
            icon: '💕',
            title: '排卵期',
            color: '#f59e0b',
            tips: ['注意身体变化', '保持好心情', '适当运动']
        },
        premenstrual: {
            icon: '⚠️',
            title: '即将来临',
            color: '#ef4444',
            tips: ['准备用品', '注意情绪', '避免生冷食物', '保持温暖']
        },
        unknown: {
            icon: '❓',
            title: '未知状态',
            color: '#9ca3af',
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
    document.getElementById('statusIcon').textContent = config.icon;
    document.getElementById('statusTitle').textContent = config.title;
    document.getElementById('statusText').textContent = statusText;
    document.getElementById('statusDays').textContent = daysText;
    
    const statusCard = document.getElementById('periodStatusCard');
    statusCard.style.borderColor = config.color + '80';
}

function updatePeriodHistory() {
    const historyEl = document.getElementById('periodHistory');
    
    if (!periodData.records || periodData.records.length === 0) {
        historyEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><div>还没有记录</div></div>';
        return;
    }

    const html = periodData.records.slice().reverse().slice(0, 10).map(record => {
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
            </div>
        `;
    }).join('');

    historyEl.innerHTML = html;
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

function recordPeriodStart() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 检查是否已经在经期中
    if (periodData.currentPeriod && !periodData.currentPeriod.endDate) {
        alert('当前已经在记录经期中！\n\n如果要重新开始，请先记录上一个经期的结束日期。');
        return;
    }

    if (confirm('确认记录今天为经期开始日期？')) {
        const newPeriod = {
            startDate: today.toISOString(),
            endDate: null
        };

        periodData.currentPeriod = newPeriod;
        
        savePeriodData().then(() => {
            showNotification('✅ 已记录经期开始');
            
            // 发送互动通知
            sendInteraction('period-start', '🌸 她的经期开始了');
        });
    }
}

function recordPeriodEnd() {
    if (!periodData.currentPeriod || periodData.currentPeriod.endDate) {
        alert('当前没有正在进行的经期记录！');
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startDate = new Date(periodData.currentPeriod.startDate);
    startDate.setHours(0, 0, 0, 0);
    
    if (today < startDate) {
        alert('结束日期不能早于开始日期！');
        return;
    }

    if (confirm('确认记录今天为经期结束日期？')) {
        periodData.currentPeriod.endDate = today.toISOString();
        
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
            showNotification('✅ 已记录经期结束');
            
            // 发送互动通知
            sendInteraction('period-end', '💚 她的经期结束了');
        });
    }
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
