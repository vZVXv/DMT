// ==UserScript==
// @name         DMT - Discord Message Translator
// @namespace    http://tampermonkey.net/
// @version      0.7.2
// @description  перевод сообщений в Discord без моргания и сброса кнопок
// @author       ZVX
// @match        https://discord.com/channels/*
// @grant        GM_xmlhttpRequest
// @connect      api.mymemory.translated.net
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const style = document.createElement('style');
    style.innerHTML = `
        .dmt-animating {
            transition: opacity 0.2s ease, transform 0.2s ease !important;
            opacity: 0 !important;
            transform: scale(0.98);
        }
        .dmt-content {
            transition: opacity 0.2s ease, transform 0.2s ease !important;
            opacity: 1;
            transform: scale(1);
        }
        .dmt-btn {
            margin-right: 8px;
            padding: 1px 6px;
            font-size: 10px;
            background: #5865F2;
            color: #fff;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            display: inline-block;
            vertical-align: middle;
        }
        .dmt-btn:hover {
            background: #4752C4;
        }
    `;
    document.head.appendChild(style);

    function isEnglishText(text) {
        const englishLetters = text.match(/[a-zA-Z]/g);
        const totalLetters = text.match(/[\p{L}]/gu);
        
        if (!englishLetters || !totalLetters) return false;
        return (englishLetters.length / totalLetters.length) > 0.3;
    }

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
        clone.querySelectorAll('time, [class*="timestamp"], [class*="edited"], [class*="repliedMessage"], button, .dmt-btn').forEach(el => el.remove());
        return clone.textContent.trim();
    }

    function replaceTextContent(node, newText, callback) {
        node.classList.add('dmt-animating');

        setTimeout(() => {
            let firstTextFound = false;

            function processNodes(parent) {
                for (let child of parent.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        if (!firstTextFound) {
                            child.nodeValue = ' ' + newText;
                            firstTextFound = true;
                        } else {
                            child.nodeValue = '';
                        }
                    } else if (child.nodeType === Node.ELEMENT_NODE) {
                        if (child.classList.contains('dmt-btn') || child.tagName === 'TIME') continue;
                        processNodes(child);
                    }
                }
            }

            processNodes(node);

            node.classList.remove('dmt-animating');
            node.classList.add('dmt-content');

            if (callback) callback();
        }, 200);
    }

    function processMessages() {
        const contentElements = document.querySelectorAll('[id^="message-content-"]');

        contentElements.forEach(contentElement => {
            // Если элемент прямо сейчас анимируется или обрабатывается — пропускаем
            if (contentElement.getAttribute('data-dmt-lock') === 'true') return;

            let currentCleanText = getCleanText(contentElement);
            if (!currentCleanText) return;

            const existingBtn = contentElement.querySelector('.dmt-btn');
            const savedOriginalText = contentElement.getAttribute('data-original-text');

            // Проверка на редактирование сообщения пользователем в Discord
            if (savedOriginalText && !existingBtn && savedOriginalText !== currentCleanText) {
                contentElement.removeAttribute('data-original-text');
                contentElement.removeAttribute('data-translated-cache');
            }

            // Если кнопка уже есть, значит сообщение уже обработано, пропускаем
            if (existingBtn) return;

            let originalText = savedOriginalText;
            if (!originalText) {
                if (!isEnglishText(currentCleanText)) return; // Не английский — пропускаем
                originalText = currentCleanText;
                contentElement.setAttribute('data-original-text', originalText);
            }

            const translateBtn = document.createElement('button');
            translateBtn.innerText = 'Перевести';
            translateBtn.className = 'dmt-btn';

            let isTranslated = false;
            let cachedTranslatedText = contentElement.getAttribute('data-translated-cache') || null;

            translateBtn.onclick = (e) => {
                e.stopPropagation();
                contentElement.setAttribute('data-dmt-lock', 'true'); // Блокируем Observer на время переключения

                if (!isTranslated) {
                    if (cachedTranslatedText) {
                        replaceTextContent(contentElement, cachedTranslatedText, () => {
                            translateBtn.innerText = 'Оригинал';
                            isTranslated = true;
                            contentElement.removeAttribute('data-dmt-lock');
                        });
                    } else {
                        translateBtn.innerText = '...';
                        translateText(originalText, (translated) => {
                            cachedTranslatedText = translated;
                            contentElement.setAttribute('data-translated-cache', translated);
                            replaceTextContent(contentElement, translated, () => {
                                translateBtn.innerText = 'Оригинал';
                                isTranslated = true;
                                contentElement.removeAttribute('data-dmt-lock');
                            });
                        });
                    }
                } else {
                    replaceTextContent(contentElement, originalText, () => {
                        translateBtn.innerText = 'Перевести';
                        isTranslated = false;
                        contentElement.removeAttribute('data-dmt-lock');
                    });
                }
            };

            contentElement.insertBefore(translateBtn, contentElement.firstChild);
        });
    }

    let timeoutId = null;
    const observer = new MutationObserver(() => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            processMessages();
        }, 150);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    processMessages();
})();
