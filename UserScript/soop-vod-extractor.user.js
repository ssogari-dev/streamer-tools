// ==UserScript==
// @name         SOOP VOD 별풍선 내역 추출기
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  SOOP VOD 별풍선 내역 추출
// @author       SSoGari Studio
// @match        https://vod.sooplive.co.kr/*
// @match        https://vod.afreecatv.com/*
// @connect      api.m.sooplive.co.kr
// @connect      videoimg.sooplive.co.kr
// @connect      videoimg.afreecatv.com
// @grant        GM_xmlhttpRequest
// @icon         https://www.google.com/s2/favicons?sz=64&domain=sooplive.co.kr
// @updateURL    https://raw.githubusercontent.com/ssogari-dev/streamer-tools/main/UserScript/soop-vod-extractor.user.js
// @downloadURL  https://raw.githubusercontent.com/ssogari-dev/streamer-tools/main/UserScript/soop-vod-extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    const CHUNK_DURATION = 60;
    const BATCH_SIZE = 8;

    function createUI() {
        if (document.getElementById('soop-extractor')) return;

        const btn = document.createElement('button');
        btn.id = 'soop-extractor';
        btn.innerText = '별풍선 내역 추출';
        btn.style.cssText = `
            position: fixed; bottom: 80px; right: 20px; z-index: 10000;
            padding: 12px 20px; background: #673AB7; color: white;
            border: none; border-radius: 8px; cursor: pointer;
            font-weight: bold; font-family: 'Malgun Gothic', sans-serif;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3); transition: transform 0.2s;
        `;
        btn.onclick = startExtraction;
        document.body.appendChild(btn);
    }

    function getVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        let titleNo = urlParams.get('nTitleNo');
        if (!titleNo) {
            const match = window.location.href.match(/\/player\/(\d+)/i);
            if (match && match[1]) titleNo = match[1];
        }
        return titleNo;
    }

    function getMetadata(titleNo) {
        return new Promise((resolve, reject) => {
            console.log("[Info] 메타데이터 API 요청 시작...");
            GM_xmlhttpRequest({
                method: "POST",
                url: "https://api.m.sooplive.co.kr/station/video/a/view",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
                },
                data: `nTitleNo=${titleNo}&nApiLevel=11&nPlaylistIdx=0`,
                onload: function(response) {
                    try {
                        const json = JSON.parse(response.responseText);
                        if (json.result === 1 && json.data) {

                            let baseKey = json.data.file_info_key;

                            if (!baseKey && json.data.thumb) {
                                console.log("[Info] file_info_key 없음 -> 썸네일 URL 파싱 시도");
                                const match = json.data.thumb.match(/rowKey=([^&]+)/);
                                if (match) {
                                    baseKey = match[1].replace(/_[a-z]+$/, '');
                                }
                            }

                            const rowKey = baseKey ? baseKey + "_c" : null;
                            const durationMs = json.data.total_file_duration;
                            const durationSec = durationMs ? Math.floor(durationMs / 1000) : 0;
                            const broadStart = json.data.broad_start;

                            // 방송 제목이 없어도 진행되도록 수정
                            const broadTitle = json.data.broad_title || "";

                            console.log(`[Info] 결과: Key=${rowKey}, Duration=${durationSec}, Start=${broadStart}`);

                            if (rowKey && durationSec > 0) {
                                resolve({ rowKey, durationSec, broadStart, broadTitle });
                            } else {
                                reject(`키를 찾을 수 없습니다. (thumb: ${json.data.thumb})`);
                            }
                        } else {
                            reject("API 결과 실패: " + (json.message || "알 수 없는 오류"));
                        }
                    } catch (e) {
                        reject("JSON 파싱 실패: " + e);
                    }
                },
                onerror: function(err) {
                    reject("네트워크 오류: " + err.status);
                }
            });
        });
    }

    function fetchChatSegment(rowKey, startTime) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://videoimg.sooplive.co.kr/php/ChatLoadSplit.php?rowKey=${rowKey}&startTime=${startTime}`,
                onload: function(response) {
                    if (response.status !== 200) { resolve([]); return; }
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(response.responseText, "text/xml");
                    const balloons = xmlDoc.getElementsByTagName("balloon");
                    const extracted = [];
                    for (let b of balloons) {
                        try {
                            extracted.push({
                                seconds: parseFloat(b.querySelector('t')?.textContent || "0"),
                                nickname: b.querySelector('n')?.textContent || "",
                                userId: b.querySelector('u')?.textContent || "",
                                count: parseInt(b.querySelector('c')?.textContent || "0")
                            });
                        } catch (e) {}
                    }
                    resolve(extracted);
                },
                onerror: () => resolve([])
            });
        });
    }

    function calculateRealTime(broadStartStr, videoSeconds) {
        if (!broadStartStr) return "-";
        const startDate = new Date(broadStartStr.replace(' ', 'T'));
        if (isNaN(startDate.getTime())) return "-";

        const realDate = new Date(startDate.getTime() + (videoSeconds * 1000));

        const y = realDate.getFullYear();
        const m = String(realDate.getMonth() + 1).padStart(2, '0');
        const d = String(realDate.getDate()).padStart(2, '0');
        const hh = String(realDate.getHours()).padStart(2, '0');
        const mm = String(realDate.getMinutes()).padStart(2, '0');
        const ss = String(realDate.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    }

    function formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }

    async function startExtraction() {
        const titleNo = getVideoId();
        if (!titleNo) {
            alert("영상 ID를 찾을 수 없습니다.");
            return;
        }

        const btn = document.getElementById('soop-extractor');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "⏳ 정보 분석 중...";

        try {
            const meta = await getMetadata(titleNo);
            const { rowKey, durationSec, broadStart, broadTitle } = meta;

            let defaultName = broadStart.split(' ')[0].replace(/-/g, '');
            if (broadTitle) {
                // 파일명으로 못 쓰는 특수문자 제거
                const safeTitle = broadTitle.replace(/[\\/:*?"<>|]/g, "_").trim();
                defaultName += `-${safeTitle}`;
            }

            const userInput = prompt(
                `영상 길이: ${formatDuration(durationSec)}\n방송 시작: ${broadStart}\n\n저장할 파일명을 입력해주세요 (확장자 .csv 제외):`,
                defaultName
            );

            // 취소 버튼 누르면 중단
            if (userInput === null) {
                btn.disabled = false;
                btn.innerText = originalText;
                return;
            }

            // 입력받은 파일명 정리
            const finalFileName = userInput.trim() + ".csv";

            let allData = [];
            for (let t = 0; t <= durationSec; t += (CHUNK_DURATION * BATCH_SIZE)) {
                const promises = [];
                for (let i = 0; i < BATCH_SIZE; i++) {
                    const currentTime = t + (i * CHUNK_DURATION);
                    if (currentTime > durationSec) break;
                    promises.push(fetchChatSegment(rowKey, currentTime));
                }

                btn.innerText = `⏳ 수집 중... ${Math.round((t / durationSec) * 100)}%`;
                const results = await Promise.all(promises);
                results.flat().forEach(item => allData.push(item));
                await new Promise(r => setTimeout(r, 50));
            }

            const processedData = allData
                .filter((v, i, a) => a.findIndex(t => (t.seconds === v.seconds && t.userId === v.userId && t.count === v.count)) === i)
                .sort((a, b) => a.seconds - b.seconds)
                .map(item => ({
                    ...item,
                    playTime: formatDuration(item.seconds),
                    realTime: calculateRealTime(broadStart, item.seconds)
                }));

            if (processedData.length === 0) {
                alert("별풍선 내역이 없거나 추출되지 않았습니다.");
            } else {
                // 사용자가 입력한 파일명으로 저장
                downloadCSV(processedData, finalFileName);
                alert(`✅ 완료! 총 ${processedData.length}건 저장됨.\n파일명: ${finalFileName}`);
            }

        } catch (e) {
            console.error(e);
            alert("오류 발생: " + e);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    function downloadCSV(data, filename) {
        let csvContent = "\uFEFF재생시간,실제시간,닉네임,아이디,개수\n";
        data.forEach(row => {
            csvContent += `${row.playTime},${row.realTime},"${row.nickname}",${row.userId},${row.count}\n`;
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    window.addEventListener('load', createUI);
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(createUI, 1000);
        }
    }).observe(document, {subtree: true, childList: true});
})();
