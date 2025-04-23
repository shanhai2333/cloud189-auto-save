document.addEventListener('DOMContentLoaded', function () {
    const apiUrlInput = document.getElementById('api-url');
    const apiKeyInput = document.getElementById('api-key');
    const saveButton = document.getElementById('save-options');

    chrome.storage.sync.get(['apiUrl', 'apiKey'], function (result) {
        apiUrlInput.value = result.apiUrl || '';
        apiKeyInput.value = result.apiKey || '';
    });

    saveButton.addEventListener('click', function () {
        const apiUrl = apiUrlInput.value;
        const apiKey = apiKeyInput.value;

        chrome.storage.sync.set({ apiUrl, apiKey }, function () {
            alert('配置保存成功');
        });
    });
});
    