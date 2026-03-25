// 后台服务脚本
// 负责管理插件状态、处理消息中转、存储操作等

class BackgroundService {
    constructor() {
        this.initialize();
    }
    
    initialize() {
        this.setupMessageListeners();
        this.setupTabListeners();
        this.setupInstallListener();
        console.log('腾讯文档自动填写助手后台服务已启动');
    }
    
    // 设置消息监听器
    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // 保持消息通道开放，用于异步响应
        });
    }
    
    // 设置标签页监听器
    setupTabListeners() {
        // 监听标签页更新
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });
        
        // 监听标签页激活
        chrome.tabs.onActivated.addListener((activeInfo) => {
            this.handleTabActivated(activeInfo);
        });
    }
    
    // 设置安装监听器
    setupInstallListener() {
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstall(details);
        });
    }
    
    // 处理消息
    async handleMessage(message, sender, sendResponse) {
        try {
            let response;
            
            switch (message.action) {
                case 'PING':
                    response = await this.handlePing(message, sender);
                    break;
                    
                case 'SAVE_HISTORY':
                    response = await this.handleSaveHistory(message, sender);
                    break;
                    
                case 'LOAD_HISTORY_LIST':
                    response = await this.handleLoadHistoryList(message, sender);
                    break;
                    
                case 'LOAD_HISTORY':
                    response = await this.handleLoadHistory(message, sender);
                    break;
                    
                case 'DELETE_HISTORY':
                    response = await this.handleDeleteHistory(message, sender);
                    break;
                    
                case 'CLEAR_ALL_HISTORY':
                    response = await this.handleClearAllHistory(message, sender);
                    break;
                    
                case 'GET_STATS':
                    response = await this.handleGetStats(message, sender);
                    break;
                    
                case 'EXPORT_HISTORIES':
                    response = await this.handleExportHistories(message, sender);
                    break;
                    
                case 'IMPORT_HISTORIES':
                    response = await this.handleImportHistories(message, sender);
                    break;
                    
                case 'CHECK_CONNECTION':
                    response = await this.handleCheckConnection(message, sender);
                    break;
                    
                case 'GET_ACTIVE_TAB':
                    response = await this.handleGetActiveTab(message, sender);
                    break;
                    
                default:
                    response = {
                        success: false,
                        error: `未知操作: ${message.action}`
                    };
            }
            
            sendResponse(response);
            
        } catch (error) {
            console.error('处理消息时出错:', error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }
    
    // 处理ping消息
    async handlePing(message, sender) {
        return {
            success: true,
            message: 'Background service is running',
            timestamp: Date.now(),
            version: chrome.runtime.getManifest().version
        };
    }
    
    // 处理保存历史记录
    async handleSaveHistory(message, sender) {
        try {
            if (!message.data || !message.data.id) {
                throw new Error('无效的历史记录数据');
            }
            
            // 调用存储API保存历史记录
            const historyKey = 'tencent_doc_history_' + message.data.id;
            await chrome.storage.local.set({
                [historyKey]: message.data
            });
            
            // 更新历史记录列表
            await this.updateHistoryList(message.data);
            
            return {
                success: true,
                id: message.data.id
            };
            
        } catch (error) {
            console.error('保存历史记录失败:', error);
            throw error;
        }
    }
    
    // 更新历史记录列表
    async updateHistoryList(history) {
        const historyListKey = 'tencent_doc_history_list';
        const { [historyListKey]: historyList = [] } = await chrome.storage.local.get(historyListKey);
        
        // 查找是否已存在相同ID的记录
        const existingIndex = historyList.findIndex(item => item.id === history.id);
        
        if (existingIndex >= 0) {
            // 更新现有记录
            historyList[existingIndex] = {
                id: history.id,
                timestamp: history.timestamp,
                name: history.name || '未命名',
                questionCount: history.questionCount || 0
            };
        } else {
            // 添加新记录
            historyList.unshift({
                id: history.id,
                timestamp: history.timestamp,
                name: history.name || '未命名',
                questionCount: history.questionCount || 0
            });
            
            // 限制最多保存50条记录
            if (historyList.length > 50) {
                const toRemove = historyList.slice(50);
                historyList.length = 50;
                
                // 删除过期的记录
                toRemove.forEach(async (oldHistory) => {
                    const oldKey = 'tencent_doc_history_' + oldHistory.id;
                    await chrome.storage.local.remove(oldKey);
                });
            }
        }
        
        // 按时间排序
        historyList.sort((a, b) => b.timestamp - a.timestamp);
        
        // 保存更新后的列表
        await chrome.storage.local.set({
            [historyListKey]: historyList
        });
    }
    
    // 处理加载历史记录列表
    async handleLoadHistoryList(message, sender) {
        try {
            const historyListKey = 'tencent_doc_history_list';
            const { [historyListKey]: historyList = [] } = await chrome.storage.local.get(historyListKey);
            
            return {
                success: true,
                data: historyList
            };
            
        } catch (error) {
            console.error('加载历史记录列表失败:', error);
            throw error;
        }
    }
    
    // 处理加载单个历史记录
    async handleLoadHistory(message, sender) {
        try {
            if (!message.data || !message.data.id) {
                throw new Error('缺少历史记录ID');
            }
            
            const historyKey = 'tencent_doc_history_' + message.data.id;
            const result = await chrome.storage.local.get(historyKey);
            
            if (result[historyKey]) {
                return {
                    success: true,
                    data: result[historyKey]
                };
            } else {
                return {
                    success: false,
                    error: '历史记录不存在'
                };
            }
            
        } catch (error) {
            console.error('加载历史记录失败:', error);
            throw error;
        }
    }
    
    // 处理删除历史记录
    async handleDeleteHistory(message, sender) {
        try {
            if (!message.data || !message.data.id) {
                throw new Error('缺少历史记录ID');
            }
            
            const historyId = message.data.id;
            
            // 从列表中移除
            const historyListKey = 'tencent_doc_history_list';
            const { [historyListKey]: historyList = [] } = await chrome.storage.local.get(historyListKey);
            const updatedList = historyList.filter(item => item.id !== historyId);
            
            await chrome.storage.local.set({
                [historyListKey]: updatedList
            });
            
            // 删除详情记录
            const historyKey = 'tencent_doc_history_' + historyId;
            await chrome.storage.local.remove(historyKey);
            
            return {
                success: true,
                deletedId: historyId
            };
            
        } catch (error) {
            console.error('删除历史记录失败:', error);
            throw error;
        }
    }
    
    // 处理清除所有历史记录
    async handleClearAllHistory(message, sender) {
        try {
            // 获取所有历史记录键
            const historyListKey = 'tencent_doc_history_list';
            const { [historyListKey]: historyList = [] } = await chrome.storage.local.get(historyListKey);
            
            // 准备要删除的键
            const keysToRemove = [historyListKey];
            historyList.forEach(history => {
                keysToRemove.push('tencent_doc_history_' + history.id);
            });
            
            // 批量删除
            await chrome.storage.local.remove(keysToRemove);
            
            return {
                success: true,
                clearedCount: historyList.length
            };
            
        } catch (error) {
            console.error('清除所有历史记录失败:', error);
            throw error;
        }
    }
    
    // 处理获取统计信息
    async handleGetStats(message, sender) {
        try {
            const historyListKey = 'tencent_doc_history_list';
            const { [historyListKey]: historyList = [] } = await chrome.storage.local.get(historyListKey);
            
            return {
                success: true,
                data: {
                    total: historyList.length,
                    latest: historyList.length > 0 ? historyList[0].timestamp : null,
                    oldest: historyList.length > 0 ? historyList[historyList.length - 1].timestamp : null
                }
            };
            
        } catch (error) {
            console.error('获取统计信息失败:', error);
            throw error;
        }
    }
    
    // 处理导出历史记录
    async handleExportHistories(message, sender) {
        try {
            const historyListKey = 'tencent_doc_history_list';
            const { [historyListKey]: historyList = [] } = await chrome.storage.local.get(historyListKey);
            
            const allHistories = [];
            
            // 加载每条记录的详情
            for (const item of historyList) {
                const historyKey = 'tencent_doc_history_' + item.id;
                const result = await chrome.storage.local.get(historyKey);
                
                if (result[historyKey]) {
                    allHistories.push(result[historyKey]);
                }
            }
            
            return {
                success: true,
                data: allHistories,
                exportTime: Date.now()
            };
            
        } catch (error) {
            console.error('导出历史记录失败:', error);
            throw error;
        }
    }
    
    // 处理导入历史记录
    async handleImportHistories(message, sender) {
        try {
            if (!message.data || !Array.isArray(message.data)) {
                throw new Error('无效的导入数据');
            }
            
            const histories = message.data;
            let importedCount = 0;
            
            // 导入每条记录
            for (const history of histories) {
                if (!history.id || !history.timestamp) {
                    console.warn('跳过无效的历史记录:', history);
                    continue;
                }
                
                // 保存历史记录
                const historyKey = 'tencent_doc_history_' + history.id;
                await chrome.storage.local.set({
                    [historyKey]: history
                });
                
                // 更新列表
                await this.updateHistoryList(history);
                importedCount++;
            }
            
            return {
                success: true,
                importedCount: importedCount,
                totalCount: histories.length
            };
            
        } catch (error) {
            console.error('导入历史记录失败:', error);
            throw error;
        }
    }
    
    // 处理检查连接状态
    async handleCheckConnection(message, sender) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                return {
                    success: false,
                    connected: false,
                    error: '未找到活动标签页'
                };
            }
            
            const isTencentDoc = tab.url && tab.url.includes('docs.qq.com/form');
            
            return {
                success: true,
                connected: isTencentDoc,
                tabId: tab.id,
                url: tab.url,
                isTencentDoc: isTencentDoc
            };
            
        } catch (error) {
            console.error('检查连接状态失败:', error);
            return {
                success: false,
                connected: false,
                error: error.message
            };
        }
    }
    
    // 处理获取活动标签页
    async handleGetActiveTab(message, sender) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                return {
                    success: false,
                    error: '未找到活动标签页'
                };
            }
            
            return {
                success: true,
                data: {
                    id: tab.id,
                    url: tab.url,
                    title: tab.title,
                    status: tab.status
                }
            };
            
        } catch (error) {
            console.error('获取活动标签页失败:', error);
            throw error;
        }
    }
    
    // 处理标签页更新
    async handleTabUpdate(tabId, changeInfo, tab) {
        // 当页面加载完成时，可以执行一些初始化操作
        if (changeInfo.status === 'complete' && tab.url && tab.url.includes('docs.qq.com/form')) {
            console.log(`腾讯文档页面已加载: ${tab.url}`);
            
            // 可以在这里发送消息通知内容脚本
            try {
                await chrome.tabs.sendMessage(tabId, {
                    action: 'PAGE_LOADED',
                    url: tab.url,
                    timestamp: Date.now()
                });
            } catch (error) {
                // 忽略错误，可能内容脚本尚未注入
            }
        }
    }
    
    // 处理标签页激活
    async handleTabActivated(activeInfo) {
        // 当切换到新标签页时，可以更新一些状态
        const tab = await chrome.tabs.get(activeInfo.tabId);
        
        if (tab.url && tab.url.includes('docs.qq.com/form')) {
            console.log(`切换到腾讯文档页面: ${tab.url}`);
        }
    }
    
    // 处理安装事件
    async handleInstall(details) {
        console.log('插件安装/更新:', details.reason, '版本:', details.previousVersion, '->', chrome.runtime.getManifest().version);
        
        // 根据安装原因执行不同的初始化操作
        switch (details.reason) {
            case 'install':
                await this.onFirstInstall();
                break;
                
            case 'update':
                await this.onUpdate(details.previousVersion);
                break;
                
            case 'chrome_update':
            case 'shared_module_update':
                break;
        }
    }
    
    // 首次安装时的初始化
    async onFirstInstall() {
        console.log('插件首次安装，执行初始化...');
        
        // 设置初始数据
        const initialData = {
            firstInstallTime: Date.now(),
            version: chrome.runtime.getManifest().version
        };
        
        await chrome.storage.local.set({
            'tencent_doc_settings': initialData
        });
        
        // 可以在这里打开欢迎页面
        chrome.tabs.create({
            url: chrome.runtime.getURL('popup/popup.html')
        });
    }
    
    // 更新时的处理
    async onUpdate(previousVersion) {
        console.log(`插件从 ${previousVersion} 更新到 ${chrome.runtime.getManifest().version}`);
        
        // 执行版本迁移逻辑
        await this.migrateData(previousVersion);
        
        // 显示更新通知
        this.showUpdateNotification(previousVersion);
    }
    
    // 数据迁移
    async migrateData(previousVersion) {
        console.log('执行数据迁移...');
        
        // 根据版本号执行不同的迁移逻辑
        if (previousVersion === '1.0.0') {
            // 从1.0.0迁移到新版本的示例
            await this.migrateFromV1_0_0();
        }
        
        // 更新存储的版本号
        await chrome.storage.local.set({
            'tencent_doc_version': chrome.runtime.getManifest().version
        });
    }
    
    // 从1.0.0版本迁移
    async migrateFromV1_0_0() {
        // 迁移旧版历史记录格式
        try {
            const oldHistoryKey = 'history_records';
            const result = await chrome.storage.local.get(oldHistoryKey);
            
            if (result[oldHistoryKey]) {
                console.log('检测到旧版历史记录，开始迁移...');
                
                const oldHistories = result[oldHistoryKey];
                const newHistories = [];
                
                // 转换格式
                for (const oldHistory of oldHistories) {
                    if (oldHistory && oldHistory.id) {
                        newHistories.push({
                            id: oldHistory.id + '_migrated',
                            timestamp: oldHistory.timestamp || Date.now(),
                            name: oldHistory.name || '迁移的记录',
                            questions: oldHistory.questions || [],
                            answers: oldHistory.answers || {},
                            questionCount: oldHistory.questions ? oldHistory.questions.length : 0
                        });
                    }
                }
                
                // 保存迁移后的数据
                if (newHistories.length > 0) {
                    for (const history of newHistories) {
                        const historyKey = 'tencent_doc_history_' + history.id;
                        await chrome.storage.local.set({
                            [historyKey]: history
                        });
                    }
                    
                    // 更新列表
                    const historyListKey = 'tencent_doc_history_list';
                    const listItems = newHistories.map(history => ({
                        id: history.id,
                        timestamp: history.timestamp,
                        name: history.name,
                        questionCount: history.questionCount
                    }));
                    
                    await chrome.storage.local.set({
                        [historyListKey]: listItems
                    });
                    
                    console.log(`成功迁移 ${newHistories.length} 条历史记录`);
                }
                
                // 删除旧数据
                await chrome.storage.local.remove(oldHistoryKey);
            }
        } catch (error) {
            console.error('数据迁移失败:', error);
        }
    }
    
    // 显示更新通知
    showUpdateNotification(previousVersion) {
        const currentVersion = chrome.runtime.getManifest().version;
        
        // 可以创建一个通知
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: '腾讯文档自动填写助手已更新',
            message: `已从 v${previousVersion} 更新到 v${currentVersion}`
        });
    }
}

// 启动后台服务
const backgroundService = new BackgroundService();

// 导出供调试使用
window.backgroundService = backgroundService;