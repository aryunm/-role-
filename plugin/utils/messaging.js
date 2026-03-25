// 消息传递工具模块

/**
 * 向内容脚本发送消息
 * @param {Object} message 消息对象
 * @param {number} timeout 超时时间（毫秒），默认5000
 * @returns {Promise<Object>} 响应结果
 */
async function sendMessageToContent(message, timeout = 5000) {
    try {
        // 获取当前活动标签页
        const [tab] = await chrome.tabs.query({ 
            active: true, 
            currentWindow: true 
        });
        
        if (!tab || !tab.id) {
            throw new Error('未找到活动标签页');
        }
        
        // 发送消息
        const response = await chrome.tabs.sendMessage(tab.id, message);
        
        if (!response) {
            throw new Error('未收到响应');
        }
        
        return response;
        
    } catch (error) {
        // 处理特定错误类型
        if (error.message.includes('Could not establish connection')) {
            throw new Error('无法连接到页面，请确保页面已加载完成且是腾讯文档页面');
        } else if (error.message.includes('Receiving end does not exist')) {
            throw new Error('内容脚本未加载，请刷新页面后重试');
        } else {
            throw error;
        }
    }
}

/**
 * 向后台脚本发送消息
 * @param {Object} message 消息对象
 * @param {number} timeout 超时时间（毫秒），默认3000
 * @returns {Promise<Object>} 响应结果
 */
async function sendMessageToBackground(message, timeout = 3000) {
    return new Promise((resolve, reject) => {
        // 设置超时
        const timeoutId = setTimeout(() => {
            reject(new Error('消息响应超时'));
        }, timeout);
        
        // 发送消息
        chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeoutId);
            
            // 检查运行时错误
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            
            resolve(response || {});
        });
    });
}

/**
 * 监听来自popup的消息（在content script中使用）
 * @param {Function} handler 消息处理器
 */
function listenFromPopup(handler) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // 确保只处理来自popup的消息
        if (sender.id !== chrome.runtime.id) {
            return false;
        }
        
        // 异步处理消息
        const processMessage = async () => {
            try {
                const result = await handler(message, sender);
                sendResponse(result || { success: true });
            } catch (error) {
                console.error('消息处理失败:', error);
                sendResponse({ 
                    success: false, 
                    error: error.message 
                });
            }
        };
        
        processMessage();
        
        // 返回true表示响应将异步发送
        return true;
    });
}

/**
 * 监听来自content script的消息（在popup中使用）
 * @param {Function} handler 消息处理器
 */
function listenFromContent(handler) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // 确保只处理来自content script的消息
        if (sender.tab) {
            const processMessage = async () => {
                try {
                    const result = await handler(message, sender);
                    sendResponse(result || { success: true });
                } catch (error) {
                    console.error('消息处理失败:', error);
                    sendResponse({ 
                        success: false, 
                        error: error.message 
                    });
                }
            };
            
            processMessage();
            return true; // 保持消息通道开放
        }
        
        return false;
    });
}

/**
 * 向所有内容脚本广播消息
 * @param {Object} message 消息对象
 * @returns {Promise<Array>} 所有响应的数组
 */
async function broadcastToAllTabs(message) {
    try {
        // 获取所有标签页
        const tabs = await chrome.tabs.query({});
        const responses = [];
        
        // 向每个标签页发送消息
        for (const tab of tabs) {
            if (tab.id) {
                try {
                    const response = await chrome.tabs.sendMessage(tab.id, message);
                    if (response) {
                        responses.push({
                            tabId: tab.id,
                            url: tab.url,
                            response: response
                        });
                    }
                } catch (error) {
                    // 忽略无法发送消息的标签页
                    console.warn(`无法向标签页 ${tab.id} 发送消息:`, error.message);
                }
            }
        }
        
        return responses;
        
    } catch (error) {
        console.error('广播消息失败:', error);
        throw error;
    }
}

/**
 * 检查内容脚本是否就绪
 * @returns {Promise<boolean>} 是否就绪
 */
async function checkContentScriptReady() {
    try {
        const response = await sendMessageToContent({ action: 'PING' }, 2000);
        return response && response.success === true;
    } catch (error) {
        return false;
    }
}

/**
 * 检查与页面的连接状态
 * @returns {Promise<Object>} 连接状态
 */
async function checkConnectionStatus() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            return { connected: false, error: '未找到活动标签页' };
        }
        
        if (!tab.url.includes('docs.qq.com/form')) {
            return { 
                connected: false, 
                error: '当前页面不是腾讯文档收集表',
                url: tab.url 
            };
        }
        
        const response = await sendMessageToContent({ action: 'PING' }, 2000);
        
        return { 
            connected: true, 
            tabId: tab.id,
            url: tab.url,
            response: response 
        };
        
    } catch (error) {
        return { 
            connected: false, 
            error: error.message 
        };
    }
}

/**
 * 发送带重试的消息
 * @param {Object} message 消息对象
 * @param {number} maxRetries 最大重试次数，默认3
 * @param {number} retryDelay 重试延迟（毫秒），默认1000
 * @returns {Promise<Object>} 响应结果
 */
async function sendMessageWithRetry(message, maxRetries = 3, retryDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await sendMessageToContent(message);
        } catch (error) {
            lastError = error;
            
            if (attempt < maxRetries) {
                console.log(`消息发送失败，第 ${attempt} 次重试...`, error.message);
                await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
            }
        }
    }
    
    throw new Error(`消息发送失败，已重试 ${maxRetries} 次: ${lastError.message}`);
}

/**
 * 存储操作消息包装器
 * 提供一种通过消息传递进行存储操作的方式
 */
const storageMessenger = {
    /**
     * 通过消息保存历史记录
     */
    async saveHistoryViaMessage(history) {
        return sendMessageToBackground({
            action: 'SAVE_HISTORY',
            data: history
        });
    },
    
    /**
     * 通过消息加载历史记录列表
     */
    async loadHistoryListViaMessage() {
        return sendMessageToBackground({
            action: 'LOAD_HISTORY_LIST'
        });
    },
    
    /**
     * 通过消息删除历史记录
     */
    async deleteHistoryViaMessage(historyId) {
        return sendMessageToBackground({
            action: 'DELETE_HISTORY',
            data: { id: historyId }
        });
    }
};

// 导出API
window.MessagingAPI = {
    sendMessageToContent,
    sendMessageToBackground,
    listenFromPopup,
    listenFromContent,
    broadcastToAllTabs,
    checkContentScriptReady,
    checkConnectionStatus,
    sendMessageWithRetry,
    storageMessenger
};