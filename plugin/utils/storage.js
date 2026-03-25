// 存储工具模块 - 用于管理历史记录

const STORAGE_KEYS = {
    HISTORY_LIST: 'tencent_doc_history_list',
    HISTORY_PREFIX: 'tencent_doc_history_'
};

/**
 * 保存历史记录
 * @param {Object} history 历史记录对象
 * @returns {Promise<void>}
 */
async function saveHistory(history) {
    if (!history || !history.id) {
        throw new Error('历史记录无效: 缺少ID');
    }
    
    try {
        // 保存历史记录详情
        const historyKey = STORAGE_KEYS.HISTORY_PREFIX + history.id;
        await chrome.storage.local.set({
            [historyKey]: history
        });
        
        // 更新历史记录列表
        await updateHistoryList(history);
        
        console.log(`历史记录保存成功: ${history.id}`);
        
    } catch (error) {
        console.error('保存历史记录失败:', error);
        throw new Error(`保存失败: ${error.message}`);
    }
}

/**
 * 更新历史记录列表
 * @param {Object} newHistory 新的历史记录
 * @returns {Promise<void>}
 */
async function updateHistoryList(newHistory) {
    try {
        const { [STORAGE_KEYS.HISTORY_LIST]: historyList = [] } = await chrome.storage.local.get(STORAGE_KEYS.HISTORY_LIST);
        
        // 查找是否已存在相同ID的记录
        const existingIndex = historyList.findIndex(item => item.id === newHistory.id);
        
        if (existingIndex >= 0) {
            // 更新现有记录
            historyList[existingIndex] = {
                id: newHistory.id,
                timestamp: newHistory.timestamp,
                name: newHistory.name,
                questionCount: newHistory.questionCount
            };
        } else {
            // 添加新记录（按时间倒序）
            historyList.unshift({
                id: newHistory.id,
                timestamp: newHistory.timestamp,
                name: newHistory.name,
                questionCount: newHistory.questionCount
            });
            
            // 限制最多保存50条记录
            if (historyList.length > 50) {
                // 删除最旧的记录
                const toRemove = historyList.slice(50);
                historyList.length = 50;
                
                // 异步删除过期的记录详情
                toRemove.forEach(async (oldHistory) => {
                    const oldKey = STORAGE_KEYS.HISTORY_PREFIX + oldHistory.id;
                    await chrome.storage.local.remove(oldKey);
                });
            }
        }
        
        // 按时间戳排序（最新的在前）
        historyList.sort((a, b) => b.timestamp - a.timestamp);
        
        // 保存更新后的列表
        await chrome.storage.local.set({
            [STORAGE_KEYS.HISTORY_LIST]: historyList
        });
        
        console.log('历史记录列表更新成功');
        
    } catch (error) {
        console.error('更新历史记录列表失败:', error);
        throw error;
    }
}

/**
 * 加载历史记录列表
 * @returns {Promise<Array>} 历史记录列表
 */
async function loadHistoryList() {
    try {
        const { [STORAGE_KEYS.HISTORY_LIST]: historyList = [] } = await chrome.storage.local.get(STORAGE_KEYS.HISTORY_LIST);
        return historyList;
        
    } catch (error) {
        console.error('加载历史记录列表失败:', error);
        return [];
    }
}

/**
 * 加载单个历史记录详情
 * @param {string} historyId 历史记录ID
 * @returns {Promise<Object|null>} 历史记录详情
 */
async function loadHistory(historyId) {
    if (!historyId) {
        return null;
    }
    
    try {
        const historyKey = STORAGE_KEYS.HISTORY_PREFIX + historyId;
        const result = await chrome.storage.local.get(historyKey);
        
        if (result[historyKey]) {
            console.log(`历史记录加载成功: ${historyId}`);
            return result[historyKey];
        } else {
            console.warn(`历史记录不存在: ${historyId}`);
            return null;
        }
        
    } catch (error) {
        console.error(`加载历史记录失败 (ID: ${historyId}):`, error);
        return null;
    }
}

/**
 * 删除历史记录
 * @param {string} historyId 历史记录ID
 * @returns {Promise<void>}
 */
async function deleteHistory(historyId) {
    if (!historyId) {
        throw new Error('历史记录ID不能为空');
    }
    
    try {
        // 从列表中移除
        const { [STORAGE_KEYS.HISTORY_LIST]: historyList = [] } = await chrome.storage.local.get(STORAGE_KEYS.HISTORY_LIST);
        const updatedList = historyList.filter(item => item.id !== historyId);
        
        await chrome.storage.local.set({
            [STORAGE_KEYS.HISTORY_LIST]: updatedList
        });
        
        // 删除详情
        const historyKey = STORAGE_KEYS.HISTORY_PREFIX + historyId;
        await chrome.storage.local.remove(historyKey);
        
        console.log(`历史记录删除成功: ${historyId}`);
        
    } catch (error) {
        console.error('删除历史记录失败:', error);
        throw new Error(`删除失败: ${error.message}`);
    }
}

/**
 * 清除所有历史记录
 * @returns {Promise<void>}
 */
async function clearAllHistory() {
    try {
        // 获取所有历史记录ID
        const { [STORAGE_KEYS.HISTORY_LIST]: historyList = [] } = await chrome.storage.local.get(STORAGE_KEYS.HISTORY_LIST);
        
        // 准备要删除的键
        const keysToRemove = [STORAGE_KEYS.HISTORY_LIST];
        historyList.forEach(history => {
            keysToRemove.push(STORAGE_KEYS.HISTORY_PREFIX + history.id);
        });
        
        // 批量删除
        await chrome.storage.local.remove(keysToRemove);
        
        console.log('所有历史记录已清除');
        
    } catch (error) {
        console.error('清除历史记录失败:', error);
        throw new Error(`清除失败: ${error.message}`);
    }
}

/**
 * 获取历史记录统计信息
 * @returns {Promise<Object>} 统计信息
 */
async function getHistoryStats() {
    try {
        const { [STORAGE_KEYS.HISTORY_LIST]: historyList = [] } = await chrome.storage.local.get(STORAGE_KEYS.HISTORY_LIST);
        
        return {
            total: historyList.length,
            latest: historyList.length > 0 ? new Date(historyList[0].timestamp) : null,
            oldest: historyList.length > 0 ? new Date(historyList[historyList.length - 1].timestamp) : null
        };
        
    } catch (error) {
        console.error('获取历史记录统计失败:', error);
        return {
            total: 0,
            latest: null,
            oldest: null
        };
    }
}

/**
 * 导入历史记录
 * @param {Array<Object>} histories 历史记录数组
 * @returns {Promise<void>}
 */
async function importHistories(histories) {
    if (!Array.isArray(histories) || histories.length === 0) {
        throw new Error('导入的数据无效');
    }
    
    try {
        const operations = [];
        const newListItems = [];
        
        // 准备要保存的数据
        histories.forEach(history => {
            if (!history.id || !history.timestamp) {
                console.warn('跳过无效的历史记录:', history);
                return;
            }
            
            const historyKey = STORAGE_KEYS.HISTORY_PREFIX + history.id;
            operations.push({ [historyKey]: history });
            
            newListItems.push({
                id: history.id,
                timestamp: history.timestamp,
                name: history.name || '导入的记录',
                questionCount: history.questionCount || 0
            });
        });
        
        if (operations.length === 0) {
            throw new Error('没有有效的记录可导入');
        }
        
        // 批量保存详情
        for (const operation of operations) {
            await chrome.storage.local.set(operation);
        }
        
        // 更新列表
        const { [STORAGE_KEYS.HISTORY_LIST]: existingList = [] } = await chrome.storage.local.get(STORAGE_KEYS.HISTORY_LIST);
        const combinedList = [...newListItems, ...existingList];
        
        // 去重并按时间排序
        const uniqueMap = new Map();
        combinedList.forEach(item => {
            if (!uniqueMap.has(item.id) || uniqueMap.get(item.id).timestamp < item.timestamp) {
                uniqueMap.set(item.id, item);
            }
        });
        
        const finalList = Array.from(uniqueMap.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50); // 限制数量
        
        await chrome.storage.local.set({
            [STORAGE_KEYS.HISTORY_LIST]: finalList
        });
        
        console.log(`成功导入 ${operations.length} 条历史记录`);
        
    } catch (error) {
        console.error('导入历史记录失败:', error);
        throw new Error(`导入失败: ${error.message}`);
    }
}

/**
 * 导出所有历史记录
 * @returns {Promise<Array>} 所有历史记录
 */
async function exportAllHistories() {
    try {
        const { [STORAGE_KEYS.HISTORY_LIST]: historyList = [] } = await chrome.storage.local.get(STORAGE_KEYS.HISTORY_LIST);
        
        const allHistories = [];
        
        // 加载每条记录的详情
        for (const item of historyList) {
            const history = await loadHistory(item.id);
            if (history) {
                allHistories.push(history);
            }
        }
        
        console.log(`导出 ${allHistories.length} 条历史记录`);
        return allHistories;
        
    } catch (error) {
        console.error('导出历史记录失败:', error);
        throw new Error(`导出失败: ${error.message}`);
    }
}

// 导出API
window.StorageAPI = {
    saveHistory,
    loadHistoryList,
    loadHistory,
    deleteHistory,
    clearAllHistory,
    getHistoryStats,
    importHistories,
    exportAllHistories
};