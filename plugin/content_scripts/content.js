// 腾讯文档收集表自动填写 - 内容脚本
// 此脚本注入到腾讯文档页面，负责抓取问题和填写答案

// ==================== 问题抓取模块 ====================

/**
 * 从腾讯文档收集表页面抓取所有问题
 * @returns {Array<{id: string, text: string, type: string, selector: string}>} 问题对象数组
 */
function fetchAllQuestions() {
    console.log('[腾讯文档助手] 开始抓取页面问题...');
    
    const questions = [];
    
    try {
        // 注意：这里的DOM选择器需要根据腾讯文档的实际结构进行调整
        // 以下是示例选择器，您需要根据实际页面结构修改
        
        // 方案1: 尝试通过常见的类名或属性查找表单项
        // 腾讯文档收集表的问题通常包含在特定的容器中
        const formItems = document.querySelectorAll(`
            [data-tag="question-item"],
            .question-item,
            .form-item,
            [role="form-item"],
            .ant-form-item,
            .weui-cell
        `);
        
        if (formItems.length > 0) {
            formItems.forEach((item, index) => {
                const question = extractQuestionFromItem(item, index);
                if (question) {
                    questions.push(question);
                }
            });
        } else {
            // 方案2: 备用选择器 - 查找所有可能的输入控件
            const inputElements = document.querySelectorAll(`
                input[type="text"],
                input[type="email"],
                input[type="tel"],
                input[type="number"],
                textarea,
                [contenteditable="true"],
                [role="textbox"]
            `);
            
            inputElements.forEach((input, index) => {
                const question = extractQuestionFromInput(input, index);
                if (question) {
                    questions.push(question);
                }
            });
        }
        
        // 如果以上方法都找不到，尝试最后的备用方案
        if (questions.length === 0) {
            console.warn('[腾讯文档助手] 标准选择器未找到问题，尝试备用方案...');
            const fallbackQuestions = findQuestionsByHeuristics();
            questions.push(...fallbackQuestions);
        }
        
        console.log(`[腾讯文档助手] 找到 ${questions.length} 个问题`);
        return questions;
        
    } catch (error) {
        console.error('[腾讯文档助手] 抓取问题时出错:', error);
        return [];
    }
}

/**
 * 从表单项中提取问题信息
 */
function extractQuestionFromItem(item, index) {
    try {
        // 尝试查找问题文本
        let questionText = '';
        
        // 尝试不同的选择器查找问题文本
        const textSelectors = [
            '.question-text',
            '.question-title',
            '.form-item-label',
            'label',
            '.weui-cell__bd h4',
            '.ant-form-item-label',
            '[data-tag="question-text"]'
        ];
        
        for (const selector of textSelectors) {
            const textElem = item.querySelector(selector);
            if (textElem && textElem.textContent && textElem.textContent.trim()) {
                questionText = textElem.textContent.trim();
                break;
            }
        }
        
        // 如果没找到，尝试在相邻元素中查找
        if (!questionText) {
            const prevSibling = item.previousElementSibling;
            if (prevSibling && prevSibling.textContent) {
                questionText = prevSibling.textContent.trim();
            }
        }
        
        // 如果还是没找到，使用默认文本
        if (!questionText) {
            questionText = `问题 ${index + 1}`;
        }
        
        // 查找输入元素
        const inputSelectors = [
            'input',
            'textarea',
            '[contenteditable="true"]',
            '[role="textbox"]',
            '.ant-input',
            '.weui-input'
        ];
        
        let targetElement = null;
        let elementType = 'unknown';
        
        for (const selector of inputSelectors) {
            const elem = item.querySelector(selector);
            if (elem) {
                targetElement = elem;
                
                // 判断元素类型
                if (elem.tagName.toLowerCase() === 'input') {
                    elementType = elem.type || 'input';
                } else if (elem.tagName.toLowerCase() === 'textarea') {
                    elementType = 'textarea';
                } else if (elem.getAttribute('contenteditable') === 'true') {
                    elementType = 'contenteditable';
                }
                break;
            }
        }
        
        if (!targetElement) {
            console.warn(`[腾讯文档助手] 在问题项中未找到输入元素: ${questionText}`);
            return null;
        }
        
        // 生成唯一标识符
        const questionId = generateQuestionId(targetElement, index);
        
        return {
            id: questionId,
            text: questionText,
            type: elementType,
            selector: generateSelector(targetElement),
            element: targetElement
        };
        
    } catch (error) {
        console.error('[腾讯文档助手] 提取问题信息时出错:', error);
        return null;
    }
}

/**
 * 直接从输入元素提取问题信息（备用方法）
 */
function extractQuestionFromInput(input, index) {
    try {
        // 尝试查找关联的label
        let questionText = '';
        const inputId = input.id;
        
        if (inputId) {
            const label = document.querySelector(`label[for="${inputId}"]`);
            if (label && label.textContent) {
                questionText = label.textContent.trim();
            }
        }
        
        // 查找前一个包含文本的兄弟元素
        if (!questionText) {
            let prevElem = input.previousElementSibling;
            while (prevElem && !questionText) {
                if (prevElem.textContent && prevElem.textContent.trim()) {
                    questionText = prevElem.textContent.trim();
                }
                prevElem = prevElem.previousElementSibling;
            }
        }
        
        if (!questionText) {
            questionText = `问题 ${index + 1}`;
        }
        
        const elementType = input.tagName.toLowerCase() === 'textarea' ? 'textarea' : 
                           (input.type || 'input');
        
        return {
            id: generateQuestionId(input, index),
            text: questionText,
            type: elementType,
            selector: generateSelector(input),
            element: input
        };
        
    } catch (error) {
        console.error('[腾讯文档助手] 从输入元素提取问题时出错:', error);
        return null;
    }
}

/**
 * 启发式查找问题（最后的备用方案）
 */
function findQuestionsByHeuristics() {
    const questions = [];
    const allElements = document.querySelectorAll('*');
    const seenSelectors = new Set();
    
    allElements.forEach((element, index) => {
        // 跳过不相关的元素
        if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || 
            element.tagName === 'META' || element.tagName === 'LINK') {
            return;
        }
        
        // 检查是否是输入元素
        const isInput = element.tagName === 'INPUT' || 
                       element.tagName === 'TEXTAREA' ||
                       element.getAttribute('contenteditable') === 'true';
        
        if (isInput) {
            const selector = generateSelector(element);
            
            // 避免重复
            if (seenSelectors.has(selector)) {
                return;
            }
            seenSelectors.add(selector);
            
            // 尝试查找问题文本
            let questionText = `问题 ${questions.length + 1}`;
            
            // 向上查找可能的问题文本
            let parent = element.parentElement;
            for (let i = 0; i < 5 && parent; i++) { // 向上查找5层
                const textElements = parent.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6, label');
                for (const textElem of textElements) {
                    if (textElem.textContent && textElem.textContent.trim() && 
                        textElem !== element && !textElem.contains(element)) {
                        const text = textElem.textContent.trim();
                        if (text.length > 2 && text.length < 100) { // 合理的文本长度
                            questionText = text;
                            break;
                        }
                    }
                }
                if (questionText !== `问题 ${questions.length + 1}`) break;
                parent = parent.parentElement;
            }
            
            const elementType = element.tagName.toLowerCase() === 'textarea' ? 'textarea' : 
                               (element.type || 'input');
            
            questions.push({
                id: generateQuestionId(element, questions.length),
                text: questionText,
                type: elementType,
                selector: selector,
                element: element
            });
        }
    });
    
    return questions;
}

/**
 * 为问题生成唯一ID
 */
function generateQuestionId(element, index) {
    // 尝试使用现有ID
    if (element.id) {
        return `id_${element.id}`;
    }
    
    // 尝试使用name
    if (element.name) {
        return `name_${element.name}`;
    }
    
    // 使用选择器
    const selector = generateSelector(element);
    if (selector) {
        return `selector_${selector.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    }
    
    // 最后使用索引
    return `index_${index}`;
}

/**
 * 生成CSS选择器
 */
function generateSelector(element) {
    if (!element || !(element instanceof Element)) {
        return '';
    }
    
    // 如果有ID，直接使用
    if (element.id) {
        return `#${CSS.escape(element.id)}`;
    }
    
    // 构建基于类名和标签名的选择器
    const parts = [];
    let current = element;
    
    while (current && current !== document.body && current !== document.documentElement) {
        let selector = current.tagName.toLowerCase();
        
        // 添加类名
        if (current.className && typeof current.className === 'string') {
            const classes = current.className.split(/\s+/).filter(c => c.length > 0);
            if (classes.length > 0) {
                selector += '.' + classes.map(c => CSS.escape(c)).join('.');
            }
        }
        
        // 尝试添加属性
        if (current.hasAttribute('data-tag')) {
            selector += `[data-tag="${CSS.escape(current.getAttribute('data-tag'))}"]`;
        }
        
        parts.unshift(selector);
        
        // 检查是否足够具体
        if (document.querySelectorAll(parts.join(' > ')).length === 1) {
            break;
        }
        
        current = current.parentElement;
    }
    
    return parts.join(' > ');
}

// ==================== 答案填写模块 ====================

/**
 * 填写答案到页面
 * @param {Array<{id: string, value: string}>} answers 答案数组
 * @returns {Object} 结果对象
 */
function fillAnswers(answers) {
    console.log('[腾讯文档助手] 开始填写答案...');
    
    const results = {
        success: 0,
        failed: 0,
        details: []
    };
    
    try {
        answers.forEach((answer, index) => {
            try {
                // 查找元素
                let element = null;
                
                // 方法1: 通过之前存储的selector查找
                if (answer.selector) {
                    try {
                        element = document.querySelector(answer.selector);
                    } catch (e) {
                        console.warn(`[腾讯文档助手] 通过选择器查找失败: ${answer.selector}`, e);
                    }
                }
                
                // 方法2: 如果selector失败，尝试通过ID查找
                if (!element && answer.id) {
                    const id = answer.id.replace(/^(id_|selector_|name_|index_)/, '');
                    
                    // 如果是ID格式
                    if (answer.id.startsWith('id_')) {
                        element = document.getElementById(id);
                    }
                    // 如果是name格式
                    else if (answer.id.startsWith('name_')) {
                        element = document.querySelector(`[name="${CSS.escape(id)}"]`);
                    }
                }
                
                if (!element) {
                    console.warn(`[腾讯文档助手] 未找到元素: ${answer.id}`);
                    results.failed++;
                    results.details.push({
                        id: answer.id,
                        success: false,
                        reason: '元素未找到',
                        selector: answer.selector
                    });
                    return;
                }
                
                // 根据元素类型填写值
                const fillSuccess = fillElementValue(element, answer.value);
                
                if (fillSuccess) {
                    results.success++;
                    results.details.push({
                        id: answer.id,
                        success: true,
                        value: answer.value.substring(0, 50) + (answer.value.length > 50 ? '...' : '')
                    });
                    
                    // 触发变更事件，确保页面能检测到值的变化
                    triggerChangeEvent(element);
                    
                } else {
                    results.failed++;
                    results.details.push({
                        id: answer.id,
                        success: false,
                        reason: '填写失败',
                        value: answer.value.substring(0, 50) + (answer.value.length > 50 ? '...' : '')
                    });
                }
                
            } catch (error) {
                console.error(`[腾讯文档助手] 填写答案时出错 (ID: ${answer.id}):`, error);
                results.failed++;
                results.details.push({
                    id: answer.id,
                    success: false,
                    reason: error.message
                });
            }
        });
        
        console.log(`[腾讯文档助手] 填写完成: 成功 ${results.success} 个, 失败 ${results.failed} 个`);
        return results;
        
    } catch (error) {
        console.error('[腾讯文档助手] 填写答案过程中发生错误:', error);
        return {
            success: 0,
            failed: answers.length,
            details: [],
            error: error.message
        };
    }
}

/**
 * 根据元素类型填写值
 */
function fillElementValue(element, value) {
    if (!element || value === null || value === undefined) {
        return false;
    }
    
    const tagName = element.tagName.toLowerCase();
    const inputType = element.type;
    
    try {
        switch (true) {
            case tagName === 'input':
                // 根据input类型处理
                switch (inputType) {
                    case 'radio':
                        // 对于单选按钮，需要找到值匹配的选项
                        const radioName = element.name;
                        if (radioName) {
                            const targetRadio = document.querySelector(`input[name="${CSS.escape(radioName)}"][value="${CSS.escape(value)}"]`);
                            if (targetRadio) {
                                targetRadio.checked = true;
                                return true;
                            }
                        }
                        return false;
                        
                    case 'checkbox':
                        element.checked = Boolean(value);
                        return true;
                        
                    case 'file':
                        // 文件上传通常不能通过脚本直接设置
                        console.warn('[腾讯文档助手] 文件上传字段无法自动填写');
                        return false;
                        
                    default:
                        // 文本、数字、邮箱等输入框
                        element.value = value;
                        return true;
                }
                
            case tagName === 'textarea':
                element.value = value;
                return true;
                
            case element.isContentEditable:
                element.textContent = value;
                return true;
                
            case element.hasAttribute('contenteditable'):
                element.textContent = value;
                return true;
                
            case element.classList && element.classList.contains('ql-editor'):
                // 处理富文本编辑器
                element.innerHTML = value;
                return true;
                
            default:
                // 尝试通用方法
                if ('value' in element) {
                    element.value = value;
                    return true;
                } else if ('textContent' in element) {
                    element.textContent = value;
                    return true;
                } else if ('innerText' in element) {
                    element.innerText = value;
                    return true;
                }
                return false;
        }
    } catch (error) {
        console.error('[腾讯文档助手] 填写元素值时出错:', error);
        return false;
    }
}

/**
 * 触发变更事件
 */
function triggerChangeEvent(element) {
    try {
        // 触发input事件
        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        
        // 触发change事件
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        
        // 触发blur事件（模拟用户离开输入框）
        element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
        
        // 对于某些框架，可能需要触发特定事件
        element.dispatchEvent(new Event('keyup', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('keydown', { bubbles: true, cancelable: true }));
        
    } catch (error) {
        console.warn('[腾讯文档助手] 触发事件时出错:', error);
    }
}

// ==================== 消息监听模块 ====================

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[腾讯文档助手] 收到消息:', message);
    
    switch (message.action) {
        case 'FETCH_QUESTIONS':
            try {
                const questions = fetchAllQuestions();
                
                // 移除element引用，因为不能通过消息传递
                const cleanQuestions = questions.map(q => ({
                    id: q.id,
                    text: q.text,
                    type: q.type,
                    selector: q.selector
                }));
                
                sendResponse({
                    success: true,
                    questions: cleanQuestions,
                    count: cleanQuestions.length
                });
            } catch (error) {
                console.error('[腾讯文档助手] 获取问题时出错:', error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            }
            break;
            
        case 'FILL_ANSWERS':
            try {
                const results = fillAnswers(message.answers);
                sendResponse({
                    success: results.failed === 0,
                    results: results
                });
            } catch (error) {
                console.error('[腾讯文档助手] 填写答案时出错:', error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            }
            break;
            
        case 'PING':
            sendResponse({
                success: true,
                message: 'Content script is ready',
                url: window.location.href
            });
            break;
            
        default:
            sendResponse({
                success: false,
                error: `未知操作: ${message.action}`
            });
    }
    
    // 保持消息通道开放，以便异步响应
    return true;
});

// 页面加载完成后发送就绪消息
console.log('[腾讯文档助手] 内容脚本已加载，等待指令...');

// 导出函数供调试使用（如果需要）
if (typeof window !== 'undefined') {
    window.__TencentDocHelper = {
        fetchAllQuestions,
        fillAnswers,
        generateSelector
    };
}