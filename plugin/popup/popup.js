// 弹出页面主脚本
class TencentDocFiller {
    constructor() {
        this.questions = [];
        this.currentAnswers = {};
        this.historyList = [];
        
        this.initElements();
        this.bindEvents();
        this.loadHistoryList();
        this.checkPageReady();
    }
    
    // 初始化DOM元素引用
    initElements() {
        this.elements = {
            fetchQuestions: document.getElementById('fetchQuestions'),
            saveHistory: document.getElementById('saveHistory'),
            historySelect: document.getElementById('historySelect'),
            loadHistory: document.getElementById('loadHistory'),
            deleteHistory: document.getElementById('deleteHistory'),
            questionsContainer: document.getElementById('questionsContainer'),
            fillAll: document.getElementById('fillAll'),
            clearAll: document.getElementById('clearAll'),
            status: document.getElementById('status')
        };
    }
    
    // 绑定事件监听器
    bindEvents() {
        // 获取问题按钮
        this.elements.fetchQuestions.addEventListener('click', () => this.fetchQuestions());
        
        // 保存历史按钮
        this.elements.saveHistory.addEventListener('click', () => this.saveCurrentAsHistory());
        
        // 加载历史按钮
        this.elements.loadHistory.addEventListener('click', () => this.loadSelectedHistory());
        
        // 删除历史按钮
        this.elements.deleteHistory.addEventListener('click', () => this.deleteSelectedHistory());
        
        // 历史记录选择变化
        this.elements.historySelect.addEventListener('change', () => {
            this.elements.loadHistory.disabled = !this.elements.historySelect.value;
            this.elements.deleteHistory.disabled = !this.elements.historySelect.value;
        });
        
        // 一键填写按钮
        this.elements.fillAll.addEventListener('click', () => this.fillAllAnswers());
        
        // 清空所有按钮
        this.elements.clearAll.addEventListener('click', () => this.clearAllInputs());
    }
    
    // 检查页面是否就绪
    async checkPageReady() {
        this.updateStatus('正在检查页面状态...');
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('docs.qq.com/form')) {
                this.updateStatus('请先打开腾讯文档收集表页面', 'error');
                this.disableAllControls();
                return;
            }
            
            // 发送ping消息检查内容脚本是否就绪
            const response = await sendMessageToContent({ action: 'PING' });
            
            if (response && response.success) {
                this.updateStatus('就绪，可以获取问题');
                this.elements.fetchQuestions.disabled = false;
            } else {
                this.updateStatus('页面未完全加载，请稍后重试', 'warning');
                this.elements.fetchQuestions.disabled = true;
            }
        } catch (error) {
            console.error('检查页面状态时出错:', error);
            this.updateStatus('无法连接到页面，请刷新后重试', 'error');
            this.disableAllControls();
        }
    }
    
    // 更新状态显示
    updateStatus(message, type = 'info') {
        const statusElem = this.elements.status;
        statusElem.textContent = message;
        
        // 移除旧的类型类
        statusElem.classList.remove('status-info', 'status-success', 'status-warning', 'status-error');
        
        // 添加新的类型类
        let typeClass = 'status-info';
        switch (type) {
            case 'success': typeClass = 'status-success'; break;
            case 'warning': typeClass = 'status-warning'; break;
            case 'error': typeClass = 'status-error'; break;
        }
        statusElem.classList.add(typeClass);
    }
    
    // 禁用所有控件
    disableAllControls() {
        this.elements.fetchQuestions.disabled = true;
        this.elements.saveHistory.disabled = true;
        this.elements.fillAll.disabled = true;
        this.elements.clearAll.disabled = true;
        this.elements.loadHistory.disabled = true;
        this.elements.deleteHistory.disabled = true;
    }
    
    // 获取页面问题
    async fetchQuestions() {
        this.updateStatus('正在获取问题...', 'info');
        this.disableAllControls();
        
        try {
            const response = await sendMessageToContent({ 
                action: 'FETCH_QUESTIONS' 
            });
            
            if (response && response.success) {
                this.questions = response.questions;
                this.currentAnswers = {};
                
                this.updateStatus(`找到 ${response.count} 个问题`, 'success');
                this.renderQuestions();
                
                // 启用相关控件
                this.elements.fillAll.disabled = response.count === 0;
                this.elements.clearAll.disabled = response.count === 0;
                this.elements.saveHistory.disabled = response.count === 0;
                this.elements.fetchQuestions.disabled = false;
                
            } else {
                this.updateStatus(`获取问题失败: ${response?.error || '未知错误'}`, 'error');
                this.showEmptyState();
                this.elements.fetchQuestions.disabled = false;
            }
        } catch (error) {
            console.error('获取问题时出错:', error);
            this.updateStatus(`连接错误: ${error.message}`, 'error');
            this.showEmptyState();
            this.elements.fetchQuestions.disabled = false;
        }
    }
    
    // 渲染问题列表
    renderQuestions() {
        const container = this.elements.questionsContainer;
        
        if (!this.questions || this.questions.length === 0) {
            this.showEmptyState();
            return;
        }
        
        // 清空容器
        container.innerHTML = '';
        
        // 创建问题项
        this.questions.forEach((question, index) => {
            const questionItem = this.createQuestionElement(question, index);
            container.appendChild(questionItem);
        });
    }
    
    // 创建单个问题元素
    createQuestionElement(question, index) {
        const item = document.createElement('div');
        item.className = 'question-item';
        item.dataset.questionId = question.id;
        
        // 问题文本
        const textElem = document.createElement('div');
        textElem.className = 'question-text';
        textElem.textContent = `${index + 1}. ${question.text}`;
        item.appendChild(textElem);
        
        // 输入框
        const inputId = `input_${question.id}`;
        
        // 根据问题类型创建不同的输入控件
        let inputElem;
        const isTextArea = question.type === 'textarea' || 
                          question.text.length > 50 || 
                          question.type.includes('text');
        
        if (isTextArea) {
            inputElem = document.createElement('textarea');
            inputElem.rows = 3;
        } else {
            inputElem = document.createElement('input');
            inputElem.type = 'text';
        }
        
        inputElem.id = inputId;
        inputElem.className = 'form-control question-input';
        inputElem.placeholder = `请输入 "${question.text}" 的答案`;
        inputElem.dataset.questionId = question.id;
        
        // 如果有历史答案，预填充
        if (this.currentAnswers[question.id]) {
            inputElem.value = this.currentAnswers[question.id];
        }
        
        // 监听输入变化
        inputElem.addEventListener('input', (e) => {
            this.currentAnswers[question.id] = e.target.value.trim();
        });
        
        // 监听变化事件
        inputElem.addEventListener('change', (e) => {
            this.currentAnswers[question.id] = e.target.value.trim();
        });
        
        item.appendChild(inputElem);
        
        return item;
    }
    
    // 显示空状态
    showEmptyState() {
        const container = this.elements.questionsContainer;
        container.innerHTML = `
            <div class="empty-state">
                未找到问题，请确保：
                <ol style="text-align: left; margin: 10px 0 10px 20px;">
                    <li>当前页面是腾讯文档收集表</li>
                    <li>页面已完全加载</li>
                    <li>点击"获取问题"按钮重试</li>
                </ol>
                <button id="retryFetch" class="btn btn-primary" style="margin-top: 10px;">
                    重新获取
                </button>
            </div>
        `;
        
        // 为重试按钮绑定事件
        const retryBtn = container.querySelector('#retryFetch');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.fetchQuestions());
        }
    }
    
    // 加载历史记录列表
    async loadHistoryList() {
        try {
            this.historyList = await loadHistoryList();
            this.renderHistorySelect();
        } catch (error) {
            console.error('加载历史记录列表时出错:', error);
        }
    }
    
    // 渲染历史记录选择框
    renderHistorySelect() {
        const select = this.elements.historySelect;
        
        // 保存当前选中的值
        const currentValue = select.value;
        
        // 清空选项（保留第一个提示选项）
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // 添加历史记录选项
        this.historyList.forEach((history, index) => {
            const option = document.createElement('option');
            option.value = history.id;
            
            // 创建显示文本
            const date = new Date(history.timestamp).toLocaleDateString('zh-CN');
            const questionCount = history.questionCount || 0;
            const firstQuestion = history.questions?.[0]?.text || '';
            const preview = firstQuestion.length > 20 ? 
                firstQuestion.substring(0, 20) + '...' : firstQuestion;
            
            option.textContent = `${date} - ${questionCount}个问题 - ${preview}`;
            option.title = `问题: ${history.questions?.map(q => q.text).join(', ').substring(0, 100)}...`;
            
            select.appendChild(option);
        });
        
        // 恢复选中的值
        if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
            select.value = currentValue;
        }
        
        // 更新按钮状态
        this.elements.loadHistory.disabled = select.options.length <= 1;
        this.elements.deleteHistory.disabled = select.options.length <= 1;
    }
    
    // 加载选中的历史记录
    async loadSelectedHistory() {
        const historyId = this.elements.historySelect.value;
        if (!historyId) return;
        
        try {
            const history = await loadHistory(historyId);
            if (!history) {
                this.updateStatus('历史记录加载失败', 'error');
                return;
            }
            
            // 填充问题答案
            this.currentAnswers = {};
            
            if (history.answers) {
                Object.assign(this.currentAnswers, history.answers);
            }
            
            // 更新输入框的值
            document.querySelectorAll('.question-input').forEach(input => {
                const questionId = input.dataset.questionId;
                if (questionId && this.currentAnswers[questionId]) {
                    input.value = this.currentAnswers[questionId];
                }
            });
            
            this.updateStatus(`已加载历史记录: ${history.name || '未命名记录'}`, 'success');
            
        } catch (error) {
            console.error('加载历史记录时出错:', error);
            this.updateStatus('加载历史记录失败', 'error');
        }
    }
    
    // 保存当前设置为历史记录
    async saveCurrentAsHistory() {
        if (this.questions.length === 0) {
            this.updateStatus('没有可保存的问题', 'warning');
            return;
        }
        
        // 收集当前答案
        const answers = {};
        let hasAnswers = false;
        
        document.querySelectorAll('.question-input').forEach(input => {
            const questionId = input.dataset.questionId;
            const value = input.value.trim();
            
            if (questionId && value) {
                answers[questionId] = value;
                hasAnswers = true;
            }
        });
        
        if (!hasAnswers) {
            this.updateStatus('没有填写任何答案，无需保存', 'warning');
            return;
        }
        
        // 创建历史记录对象
        const history = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            questions: this.questions,
            answers: answers,
            questionCount: this.questions.length,
            name: prompt('为历史记录命名:', 
                `记录_${new Date().toLocaleDateString('zh-CN')}`) || 
                `记录_${new Date().toLocaleDateString('zh-CN')}`
        };
        
        if (!history.name) {
            this.updateStatus('保存已取消', 'info');
            return;
        }
        
        try {
            await saveHistory(history);
            this.updateStatus('历史记录保存成功', 'success');
            
            // 重新加载历史记录列表
            await this.loadHistoryList();
            
            // 选中新保存的记录
            this.elements.historySelect.value = history.id;
            this.elements.loadHistory.disabled = false;
            this.elements.deleteHistory.disabled = false;
            
        } catch (error) {
            console.error('保存历史记录时出错:', error);
            this.updateStatus('保存失败', 'error');
        }
    }
    
    // 删除选中的历史记录
    async deleteSelectedHistory() {
        const historyId = this.elements.historySelect.value;
        if (!historyId || !confirm('确定要删除这条历史记录吗？')) {
            return;
        }
        
        try {
            await deleteHistory(historyId);
            this.updateStatus('历史记录已删除', 'success');
            
            // 重新加载历史记录列表
            await this.loadHistoryList();
            
        } catch (error) {
            console.error('删除历史记录时出错:', error);
            this.updateStatus('删除失败', 'error');
        }
    }
    
    // 一键填写所有答案
    async fillAllAnswers() {
        if (this.questions.length === 0) {
            this.updateStatus('没有找到问题', 'warning');
            return;
        }
        
        // 收集所有答案
        const answers = [];
        let emptyCount = 0;
        
        this.questions.forEach(question => {
            const input = document.querySelector(`.question-input[data-question-id="${question.id}"]`);
            const value = input ? input.value.trim() : '';
            
            if (value) {
                answers.push({
                    id: question.id,
                    selector: question.selector,
                    value: value
                });
            } else {
                emptyCount++;
            }
        });
        
        if (answers.length === 0) {
            this.updateStatus('请先填写答案', 'warning');
            return;
        }
        
        if (emptyCount > 0) {
            if (!confirm(`有 ${emptyCount} 个问题未填写，是否继续？`)) {
                return;
            }
        }
        
        this.updateStatus(`正在填写 ${answers.length} 个答案...`, 'info');
        this.disableAllControls();
        
        try {
            const response = await sendMessageToContent({
                action: 'FILL_ANSWERS',
                answers: answers
            });
            
            if (response && response.success) {
                this.updateStatus(`填写完成: ${response.results.success} 成功, ${response.results.failed} 失败`, 'success');
                
                // 显示详细结果
                if (response.results.failed > 0) {
                    const failedDetails = response.results.details
                        .filter(d => !d.success)
                        .map(d => `ID: ${d.id} - ${d.reason}`)
                        .join('\n');
                    
                    alert(`填写完成，但有失败项：\n${failedDetails}`);
                }
                
            } else {
                this.updateStatus(`填写失败: ${response?.error || '未知错误'}`, 'error');
            }
        } catch (error) {
            console.error('填写答案时出错:', error);
            this.updateStatus(`填写失败: ${error.message}`, 'error');
        } finally {
            this.elements.fetchQuestions.disabled = false;
            this.elements.fillAll.disabled = false;
            this.elements.clearAll.disabled = false;
            this.elements.saveHistory.disabled = false;
        }
    }
    
    // 清空所有输入框
    clearAllInputs() {
        if (!confirm('确定要清空所有已填写的内容吗？')) {
            return;
        }
        
        document.querySelectorAll('.question-input').forEach(input => {
            input.value = '';
        });
        
        this.currentAnswers = {};
        this.updateStatus('已清空所有输入框', 'success');
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    // 添加状态样式
    const style = document.createElement('style');
    style.textContent = `
        .status-info { background-color: #f0f0f0; color: #666; }
        .status-success { background-color: #d4edda; color: #155724; border-color: #c3e6cb; }
        .status-warning { background-color: #fff3cd; color: #856404; border-color: #ffeaa7; }
        .status-error { background-color: #f8d7da; color: #721c24; border-color: #f5c6cb; }
    `;
    document.head.appendChild(style);
    
    // 创建应用实例
    window.app = new TencentDocFiller();
});