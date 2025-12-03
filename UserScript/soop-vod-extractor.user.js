// ==UserScript==
// @name         SOOP VOD 별풍선 내역 추출기
// @namespace    http://tampermonkey.net/
// @version      1.8
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

                            const segments = [];
                            const broadStart = json.data.broad_start;
                            const broadTitle = json.data.broad_title || "";

                            // 1. 분할된 영상(files)이 있는 경우
                            if (json.data.files && Array.isArray(json.data.files) && json.data.files.length > 0) {
                                console.log(`[Info] 분할된 영상 발견: ${json.data.files.length}개`);
                                // file_order 순으로 정렬
                                json.data.files.sort((a, b) => a.file_order - b.file_order);
                                
                                json.data.files.forEach(f => {
                                    if (f.file_info_key) {
                                        const duration = f.duration ? Math.floor(f.duration / 1000) : 0;
                                        segments.push({
                                            rowKey: f.file_info_key + "_c",
                                            duration: duration
                                        });
                                    }
                                });
                            } 
                            
                            // 2. 단일 영상인 경우 (또는 files 처리에 실패한 경우)
                            if (segments.length === 0) {
                                let baseKey = json.data.file_info_key;
                                
                                if (!baseKey && json.data.thumb) {
                                    console.log("[Info] file_info_key 없음 -> 썸네일 URL 파싱 시도");
                                    const match = json.data.thumb.match(/rowKey=([^&]+)/);
                                    if (match) {
                                        baseKey = match[1].replace(/_[a-z]+$/, '');
                                    }
                                }

                                if (baseKey) {
                                    const durationMs = json.data.total_file_duration;
                                    const durationSec = durationMs ? Math.floor(durationMs / 1000) : 0;
                                    segments.push({
                                        rowKey: baseKey + "_c",
                                        duration: durationSec
                                    });
                                }
                            }

                            console.log(`[Info] 수집 대상 세그먼트: ${segments.length}개`, segments);

                            if (segments.length > 0) {
                                resolve({ segments, broadStart, broadTitle });
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
            const { segments, broadStart, broadTitle } = meta;

            // 전체 길이 계산 (모든 세그먼트 합산)
            const totalDuration = segments.reduce((acc, cur) => acc + cur.duration, 0);

            let defaultName = broadStart.split(' ')[0].replace(/-/g, '');
            if (broadTitle) {
                const safeTitle = broadTitle.replace(/[\\/:*?"<>|]/g, "_").trim();
                defaultName += `-${safeTitle}`;
            }

            const userInput = prompt(
                `영상 길이: ${formatDuration(totalDuration)} (분할: ${segments.length}개)\n방송 시작: ${broadStart}\n\n저장할 파일명을 입력해주세요 (확장자 .csv 제외):`,
                defaultName
            );

            if (userInput === null) {
                btn.disabled = false;
                btn.innerText = originalText;
                return;
            }

            const finalFileName = userInput.trim() + ".csv";
            let allData = [];
            
            // 전체 진행률 계산을 위한 변수
            let currentTotalProgress = 0;
            
            // accumulatedTime: 이전 파트까지의 총 시간 (실제 시간 계산용)
            let accumulatedTime = 0;

            for (let sIdx = 0; sIdx < segments.length; sIdx++) {
                const segment = segments[sIdx];
                const { rowKey, duration } = segment;
                
                console.log(`[Info] 파트 ${sIdx + 1}/${segments.length} 수집 시작 (Key: ${rowKey}, 길이: ${duration}초)`);

                for (let t = 0; t <= duration; t += (CHUNK_DURATION * BATCH_SIZE)) {
                    const promises = [];
                    for (let i = 0; i < BATCH_SIZE; i++) {
                        const currentTime = t + (i * CHUNK_DURATION);
                        if (currentTime > duration) break;
                        promises.push(fetchChatSegment(rowKey, currentTime));
                    }

                    // 진행률 표시 (전체 기준)
                    const progressPercent = Math.round(((currentTotalProgress + t) / totalDuration) * 100);
                    btn.innerText = `⏳ 수집 중... ${progressPercent}% (파트 ${sIdx + 1}/${segments.length})`;

                    const results = await Promise.all(promises);
                    
                    // 수집된 데이터에 offset 시간(이전 파트들의 길이 합)을 더해줌
                    // 이렇게 해야 나중에 전체 타임라인에서 시간이 이어짐
                    results.flat().forEach(item => {
                        // item.seconds는 해당 파트 내에서의 시간 (0부터 시작)
                        // realSeconds: 방송 시작부터의 누적 시간
                        const realSeconds = accumulatedTime + item.seconds;
                        allData.push({
                            ...item,
                            realSeconds: realSeconds // 정렬 및 실제 시간 계산용
                        });
                    });
                    
                    await new Promise(r => setTimeout(r, 50));
                }
                
                currentTotalProgress += duration;
                accumulatedTime += duration;
            }

            const processedData = allData
                .filter((v, i, a) => a.findIndex(t => (t.realSeconds === v.realSeconds && t.userId === v.userId && t.count === v.count)) === i)
                .sort((a, b) => a.realSeconds - b.realSeconds)
                .map(item => ({
                    nickname: item.nickname,
                    userId: item.userId,
                    count: item.count,
                    playTime: formatDuration(item.realSeconds),
                    realTime: calculateRealTime(broadStart, item.realSeconds)
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
