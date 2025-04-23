chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openOptionsPage') {
        chrome.runtime.openOptionsPage();
    }
});

// chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
//     if (changeInfo.status === 'complete') {
//         try {
//             // 检查是否已配置接口信息
//             const { apiUrl, apiKey } = await new Promise((resolve) => {
//                 chrome.storage.sync.get(['apiUrl', 'apiKey'], resolve);
//             });

//             if (apiUrl && apiKey) {
//                 // 已配置接口信息，设置弹出页为转存页面
//                 chrome.action.setPopup({ tabId: tabId, popup: 'popup.html' });
//                 chrome.action.enable(tabId);
//             } else {
//                 // 未配置接口信息，设置弹出页为配置页面
//                 chrome.action.setPopup({ tabId: tabId, popup: 'options.html' });
//                 chrome.action.enable(tabId);
//             }
//         } catch (error) {
//             console.error('获取接口配置信息时出错:', error);
//             chrome.action.disable(tabId);
//         }
//     } else {
//         console.log('Tab 状态变化:', changeInfo.status);
//         chrome.action.disable(tabId);
//     }
// });    