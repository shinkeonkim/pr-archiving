require('dotenv').config();
const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// 환경변수: GITHUB_TOKEN, REPO_OWNER, REPO_NAME, GITHUB_AUTHOR
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const GITHUB_AUTHOR = process.env.GITHUB_AUTHOR || 'shinkeonkim';
const BROWSER_URL = process.env.BROWSER_URL || 'http://localhost:9222';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * PR 제목에서 파일명으로 사용할 수 없는 문자를 '_'로 치환하는 함수입니다.
 */
function sanitizeFilename(title) {
  return title.replace(/[\/\\:*?"<>|]/g, '_').trim();
}

/**
 * 페이지 내 "Load more…" 버튼(클래스명 ajax-pagination-btn)을 모두 클릭합니다.
 * (최대 10회 반복하여 무한루프 방지)
 */
async function clickAllLoadMore(page) {
  for (let i = 0; i < 10; i++) {
    const btn = await page.$('button.ajax-pagination-btn');
    if (!btn) break;
    console.log('Load more 버튼 클릭 중...');
    try {
      await btn.click();
    } catch (err) {
      console.error('Load more 버튼 클릭 에러:', err.message);
    }
    await wait(1500);
  }
}

/**
 * 페이지 내 "Show resolved" 버튼(클래스명 Details-content--closed)을 모두 클릭합니다.
 * (최대 10회 반복하여 무한루프 방지)
 * – evaluate() 내부에서 모두 클릭하여 클릭 가능하지 않은 요소 오류를 회피합니다.
 */
async function clickAllShowResolved(page) {
  for (let i = 0; i < 10; i++) {
    const didClick = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('span.Details-content--closed'));
      if (!buttons.length) return false;
      buttons.forEach(btn => {
        try {
          btn.click();
        } catch (e) {
          // 클릭 실패 시 무시
        }
      });
      return true;
    });
    if (!didClick) break;
    console.log('Show resolved 버튼 클릭 완료');
    await wait(500);
  }
}

/**
 * GitHub Search API를 페이지네이션하여 모든 PR 목록을 가져옵니다.
 * 쿼리 형식: "is:pr+repo:{owner}/{repo}+author:{author}"
 * → 한 페이지당 40개씩 요청합니다.
 */
async function getAllPRs() {
  let allPRs = [];
  let page = 1;
  const perPage = 40;
  while (true) {
    const url = `https://api.github.com/search/issues?q=is:pr+repo:${REPO_OWNER}/${REPO_NAME}+author:${GITHUB_AUTHOR}&per_page=${perPage}&page=${page}`;
    console.log(`API 호출: ${url}`);
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    const data = await response.json();
    if (!data.items) {
      console.error("예상치 못한 응답:", data);
      break;
    }
    allPRs = allPRs.concat(data.items);
    if (data.items.length < perPage) break;
    page++;
  }
  return allPRs;
}

/**
 * 하나의 PR에 대해, 상세 페이지와 Files 페이지에서
 * 먼저 "Load more…" 버튼을 모두 클릭한 후 "Show resolved" 버튼을 모두 클릭하고 스크린샷을 찍습니다.
 * 스크린샷 파일명에는 PR 번호와 제목을 포함합니다.
 */
async function processPR(pr, browser, screenshotsDir) {
  const baseUrl = pr.pull_request && pr.pull_request.html_url ? pr.pull_request.html_url : pr.html_url;
  const safeTitle = sanitizeFilename(pr.title);
  
  // 1. 상세 페이지 처리
  console.log(`PR #${pr.number} (${pr.title}) 상세 페이지 처리 중: ${baseUrl}`);

  const detailsPage = await browser.newPage();
  try {
    await detailsPage.goto(baseUrl, { waitUntil: 'networkidle2' });
    await clickAllLoadMore(detailsPage);
    await clickAllShowResolved(detailsPage);
    // 뷰포트 설정 (예: 1280x800)
    await detailsPage.setViewport({ width: 1280, height: 800 });
    const detailsPath = path.join(screenshotsDir, `PR_${pr.number}_${safeTitle}_details.png`);
    try {
      await detailsPage.screenshot({ path: detailsPath, fullPage: true });
    } catch (err) {
      console.error(`상세 페이지 fullPage 스크린샷 실패: ${err.message}. 재시도...`);
      await wait(1000);
      await detailsPage.screenshot({ path: detailsPath, fullPage: false });
    }
    console.log(`상세 페이지 스크린샷 저장됨: ${detailsPath}`);
  } catch (err) {
    throw new Error(`PR #${pr.number} 상세 페이지 처리 에러: ${err.message}`);
  } finally {
    await detailsPage.close();
  }
  
  // 2. Files 페이지 처리
  const filesUrl = baseUrl.endsWith('/files') ? baseUrl : baseUrl + '/files';
  console.log(`PR #${pr.number} (${pr.title}) Files 페이지 처리 중: ${filesUrl}`);

  const filesPage = await browser.newPage();
  try {
    await filesPage.goto(filesUrl, { waitUntil: 'networkidle2' });
    await clickAllLoadMore(filesPage);
    await clickAllShowResolved(filesPage);
    await filesPage.setViewport({ width: 1280, height: 800 });
    const filesPath = path.join(screenshotsDir, `PR_${pr.number}_${safeTitle}_files.png`);
    try {
      await filesPage.screenshot({ path: filesPath, fullPage: true });
    } catch (err) {
      console.error(`Files 페이지 fullPage 스크린샷 실패: ${err.message}. 재시도...`);
      await wait(1000);
      await filesPage.screenshot({ path: filesPath, fullPage: false });
    }
    console.log(`Files 페이지 스크린샷 저장됨: ${filesPath}`);
  } catch (err) {
    throw new Error(`PR #${pr.number} Files 페이지 처리 에러: ${err.message}`);
  } finally {
    await filesPage.close();
  }
}

/**
 * processPR 함수를 재시도 로직으로 감싼 함수입니다.
 * 에러 발생 시 1회 재시도합니다.
 */
async function processPRRetry(pr, browser, screenshotsDir) {
  try {
    await processPR(pr, browser, screenshotsDir);
  } catch (err) {
    console.error(`PR #${pr.number} 처리 중 에러 발생: ${err.message}. 재시도합니다.`);
    await wait(2000);
    await processPR(pr, browser, screenshotsDir);
  }
}

/**
 * 주어진 작업(함수 배열)을 지정된 동시 처리 제한(batchSize)으로 실행합니다.
 */
async function runTasksInBatches(tasks, batchSize) {
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    await Promise.all(batch.map(task => task()));
  }
}

/**
 * 모든 PR에 대해 스크린샷 작업을 동시 20개씩 처리합니다.
 */
async function screenshotPRs(prs) {
  const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
  
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }
  
  const tasks = prs.map(pr => {
    return async () => {
      await processPRRetry(pr, browser, screenshotsDir);
    };
  });
  
  const concurrencyLimit = 20; // 동시에 20개 탭 처리
  await runTasksInBatches(tasks, concurrencyLimit);
  
  await browser.disconnect();
}

/**
 * 메인 함수: 모든 페이지의 PR 목록을 가져와 스크린샷 저장을 실행합니다.
 */
async function main() {
  const prs = await getAllPRs();
  if (prs.length === 0) {
    console.log('조건에 맞는 Pull Request가 없습니다.');
    return;
  }
  console.log(`${prs.length}개의 PR을 찾았습니다. 스크린샷을 저장합니다...`);
  await screenshotPRs(prs);
}

main().catch(err => {
  console.error('에러 발생:', err);
});
