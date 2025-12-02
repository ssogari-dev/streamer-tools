// ==UserScript==
// @name         위플랩 룰렛 내역 추출기
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  위플랩(Weflab)에서 룰렛 내역을 추출합니다.
// @author       SSoGari Studio
// @match        https://weflab.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=weflab.com
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ssogari-dev/streamer-tools/main/UserScript/weflab-roulette.user.js
// @downloadURL  https://raw.githubusercontent.com/ssogari-dev/streamer-tools/main/UserScript/weflab-roulette.user.js
// ==/UserScript==

(function() {
    'use strict';

    let capturedIdx = null;

    // 네트워크 스니핑 (idx 자동 감지)
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        if (!capturedIdx && url.includes('idx=')) {
            const match = url.match(/idx=([^&]+)/);
            if (match) {
                capturedIdx = match[1];
                console.log("[Sniffer] idx 발견:", capturedIdx);
                updateUIState();
            }
        }
        return originalOpen.apply(this, arguments);
    };

    function createUI() {
        if (document.getElementById('weflab-extract-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'weflab-extract-btn';
        btn.innerText = '🎲 룰렛 내역 추출';
        btn.disabled = true;
        btn.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 9999;
            padding: 12px 20px; background: #999; color: white;
            border: none; border-radius: 50px; cursor: not-allowed;
            font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            font-family: 'Malgun Gothic', sans-serif; font-size: 14px;
            transition: all 0.3s;
        `;
        btn.onclick = startExtraction;
        document.body.appendChild(btn);

        setTimeout(detectIdx, 500);
        setTimeout(detectIdx, 2000);
    }

    function detectIdx() {
        if (capturedIdx) return;
        const cookieMatch = document.cookie.match(/login_idx=([^;]+)/);
        if (cookieMatch) {
            capturedIdx = cookieMatch[1];
            console.log("[Cookie] idx 발견:", capturedIdx);
        } else {
            const urlParams = new URLSearchParams(window.location.search);
            const urlIdx = urlParams.get('idx');
            if (urlIdx) {
                capturedIdx = urlIdx;
                console.log("[URL] idx 발견:", capturedIdx);
            }
        }
        updateUIState();
    }

    function updateUIState() {
        const btn = document.getElementById('weflab-extract-btn');
        if (btn && capturedIdx) {
            btn.innerText = '🎲 룰렛 내역 추출';
            btn.style.backgroundColor = '#FF4081';
            btn.style.cursor = 'pointer';
            btn.disabled = false;
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return "";
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const h = String(date.getHours()).padStart(2, '0');
            const min = String(date.getMinutes()).padStart(2, '0');
            return `${y}-${m}-${d} ${h}:${min}`;
        } catch (e) { return dateStr; }
    }

    function getFilterDate(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const h = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');
        return `${y}${m}${d}${h}${min}`;
    }

    async function startExtraction() {
        if (!capturedIdx) {
            capturedIdx = prompt("idx를 찾을 수 없습니다. 값을 입력해주세요:");
            if (!capturedIdx) return;
        }

        const btn = document.getElementById('weflab-extract-btn');
        const now = new Date();
        const future = new Date(); future.setFullYear(now.getFullYear() + 1);
        const past = new Date(); past.setFullYear(now.getFullYear() - 1);

        const filterEnd = getFilterDate(future);
        const filterStart = getFilterDate(past);

        let lastDate = "";
        let allRows = [];
        let isRunning = true;
        let pageCount = 0;

        const originalText = btn.innerText;
        btn.innerText = "⏳ 수집 중...";
        btn.disabled = true;

        try {
            while (isRunning) {
                pageCount++;

                const payload = new URLSearchParams();
                payload.append('type', 'alertlist_load');
                payload.append('pagetype', 'setup');
                payload.append('idx', capturedIdx);
                payload.append('pageid', 'alertlist');
                payload.append('preset', '0');
                payload.append('ver[server]', '20240607');
                payload.append('ver[socket]', '20240607');
                payload.append('lastdate', lastDate);
                payload.append('filter[start]', filterStart);
                payload.append('filter[end]', filterEnd);
                payload.append('filter[min]', '0');
                payload.append('filter[type]', 'all');
                payload.append('filter[search]', '');

                const response = await fetch('https://weflab.com/api/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                    body: payload
                });

                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
                const json = await response.json();

                if (json.result !== "success") {
                    alert("데이터 로드 실패: " + json.result);
                    break;
                }

                const dataList = json.data;
                if (!dataList || dataList.length === 0) {
                    alert("✅ 수집 완료!");
                    break;
                }

                let currentPageRows = [];
                let rouletteCount = 0;

                dataList.forEach(item => {
                    // 룰렛 결과가 없으면 건너뜀
                    if (!item.roulette || item.roulette.trim() === "") return;
                    rouletteCount++;

                    // 1. list 파싱 (묶음 여부 확인)
                    let listArray = [];
                    if (item.list && item.list.trim() !== "") {
                        try {
                            listArray = JSON.parse(item.list);
                        } catch (e) { console.warn("JSON Parse Error", e); }
                    }

                    // 2. 값 계산
                    const totalValue = parseInt(item.value || "0", 10);
                    const count = listArray.length > 0 ? listArray.length : 1;
                    const unitValue = Math.floor(totalValue / count); // 1회당 가격

                    // 기본 정보
                    const baseInfo = {
                        time: formatDate(item.create_time),
                        name: item.name,
                        id: item.id,
                        total_value: totalValue, // 원본 총액 (300)
                        unit_value: unitValue,   // 1회당 (30)
                    };

                    if (listArray.length > 0) {
                        // [Case A] 연속 뽑기: index를 사용하여 묶음 정보 생성
                        listArray.forEach((opt, index) => {
                            currentPageRows.push({
                                ...baseInfo,
                                win_result: opt[0] || "",
                                win_percent: opt[1] || "",
                                batch_info: `${index + 1}/${count}` // 예: 1/10, 2/10...
                            });
                        });
                    } else {
                        // [Case B] 단일 뽑기
                        currentPageRows.push({
                            ...baseInfo,
                            win_result: item.roulette,
                            win_percent: item.percent,
                            batch_info: "1/1"
                        });
                    }
                });

                allRows = allRows.concat(currentPageRows);
                lastDate = json.lastdate;

                await new Promise(r => setTimeout(r, 200));

                const confirmMsg = `[${pageCount}페이지]\n` +
                                   `룰렛 이벤트: ${rouletteCount}건\n` +
                                   `추출된 상세 내역: ${currentPageRows.length}개\n` +
                                   `누적 내역: ${allRows.length}개\n\n` +
                                   `마지막: ${formatDate(lastDate)}\n\n` +
                                   `계속 하시겠습니까?`;

                if (!confirm(confirmMsg)) isRunning = false;
            }

            if (allRows.length > 0) {
                downloadCSV(allRows, `Weflab_Roulette_${getFilterDate(new Date())}.csv`);
            } else {
                alert("저장할 데이터가 없습니다.");
            }

        } catch (e) {
            console.error(e);
            alert("오류: " + e.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    function downloadCSV(data, filename) {
        // 헤더 수정 (총별풍선, 1회당별풍선, 묶음정보 추가)
        let csvContent = "\uFEFF시간,닉네임,아이디,총별풍선(묶음),1회당별풍선,묶음정보,당첨결과,확률\n";

        data.forEach(row => {
            const clean = t => `"${String(t || "").replace(/"/g, '""')}"`;
            csvContent += `${clean(row.time)},${clean(row.name)},${clean(row.id)},${clean(row.total_value)},${clean(row.unit_value)},${clean(row.batch_info)},${clean(row.win_result)},${clean(row.win_percent)}\n`;
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
})();
