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
        
        // 添加动画效果
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
        // 初始化 PeerJS
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
            // 更新自己的 Peer ID
            db.ref(`couples/${coupleId}/peerIds/${userId}`).set(id);
        });

        // 接收通话
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
        // 获取本地媒体流
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        document.getElementById('localVideo').srcObject = localStream;

        // 获取对方的 Peer ID
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

        // 发起通话
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
