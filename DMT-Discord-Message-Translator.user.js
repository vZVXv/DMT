// ==UserScript==
// @name         DMT - Discord Message Translator
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  перевод сообщений в Discord
// @author       ZVX
// @match        https://discord.com/channels/*
// @grant        GM_xmlhttpRequest
// @connect      api.mymemory.translated.net
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    function translateText(text, callback) {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ru`;
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data && data.responseData) {
                        callback(data.responseData.translatedText);
                    } else {
                        callback("Ошибка перевода");
                    }
                } catch (e) {
                    callback("Ошибка обработки ответа");
                }
            },
            onerror: function() {
                callback("Ошибка сети");
            }
        });
    }

    function getCleanText(element) {
        const clone = element.cloneNode(true);
        clone.querySelectorAll('time, [class*="timestamp"], [class*="edited"], [class*="repliedMessage"], button').forEach(el => el.remove());
        return clone.textContent.trim();
    }

    function replaceTextNodes(node, newText) {
        let textNodeFound = false;

        function walk(current) {
            for (let child of Array.from(current.childNodes)) {
                if (child.nodeType === Element.ELEMENT_NODE) {
                    if (child.tagName === 'TIME' ||
                        child.tagName === 'BUTTON' ||
                        child.matches('[class*="timestamp"], [class*="edited"]')) {
                        continue;
                    }
                    walk(child);
                } else if (child.nodeType === Node.TEXT_NODE) {
                    if (!textNodeFound && child.textContent.trim().length > 0) {
                        child.textContent = newText + ' ';
                        textNodeFound = true;
                    } else if (textNodeFound && child.textContent.trim().length > 0) {
                        child.textContent = '';
                    }
                }
            }
        }

        walk(node);
    }

    function processMessages() {
        const contentElements = document.querySelectorAll('[id^="message-content-"]:not([data-translated])');

        contentElements.forEach(contentElement => {
            contentElement.setAttribute('data-translated', 'true');

            const originalText = getCleanText(contentElement);
            if (!originalText) return;

            const translateBtn = document.createElement('button');
            translateBtn.innerText = 'Перевести';
            translateBtn.style.marginLeft = '8px';
            translateBtn.style.padding = '1px 4px';
            translateBtn.style.fontSize = '10px';
            translateBtn.style.background = '#5865F2';
            translateBtn.style.color = '#fff';
            translateBtn.style.border = 'none';
            translateBtn.style.borderRadius = '3px';
            translateBtn.style.cursor = 'pointer';
            translateBtn.style.display = 'inline-block';
            translateBtn.style.verticalAlign = 'middle';

            let isTranslated = false;
            let cachedTranslatedText = null;

            translateBtn.onclick = (e) => {
                e.stopPropagation();
                if (!isTranslated) {
                    if (cachedTranslatedText) {
                        replaceTextNodes(contentElement, cachedTranslatedText);
                        translateBtn.innerText = 'Оригинал';
                        isTranslated = true;
                    } else {
                        translateBtn.innerText = '...';
                        translateText(originalText, (translated) => {
                            cachedTranslatedText = translated;
                            replaceTextNodes(contentElement, translated);
                            translateBtn.innerText = 'Оригинал';
                            isTranslated = true;
                        });
                    }
                } else {
                    replaceTextNodes(contentElement, originalText);
                    translateBtn.innerText = 'Перевести';
                    isTranslated = false;
                }
            };

            contentElement.appendChild(translateBtn);
        });
    }

    const observer = new MutationObserver(() => {
        processMessages();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
