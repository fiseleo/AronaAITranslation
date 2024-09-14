// 词汇映射表，初始为空，将从 JSON 文件中加载
let dictionary = {};
let studentMapping = {};
let eventMapping = {};  // 用于加载 Event.json
let isTranslating = false;

// 使用 fetch 同时加载 dictionary.json、students_mapping.json 和 Event.json 文件
Promise.all([
  fetch(chrome.runtime.getURL('dictionary.json')).then(response => response.json()),
  fetch(chrome.runtime.getURL('students_mapping.json')).then(response => response.json()),
  fetch(chrome.runtime.getURL('Event.json')).then(response => response.json()),  // 加载 Event.json
  fetch(chrome.runtime.getURL('Club.json')).then(response => response.json()),  // 加载 Club.json
  fetch(chrome.runtime.getURL('School.json')).then(response => response.json())  // 加载 school.json
  
])
  .then(([dictionaryData, studentMappingData, eventMappingData , ClubMappingData , SchoolMappingData]) => {
    dictionary = { ...dictionaryData, ...eventMappingData , ...ClubMappingData , ...SchoolMappingData}; // 将加载到的字典数据存储到全局变量
    studentMapping = studentMappingData; // 将学生映射表存储到全局变量
    eventMapping = eventMappingData;  // 将事件映射表存储到全局变量
    ClubMapping = ClubMappingData;  // 将社团映射表存储到全局变量
    SchoolMapping = SchoolMappingData;  // 将社团映射表存储到全局变量
    console.log('词汇映射表已加载:', dictionary);
    console.log('学生映射表已加载:', studentMapping);
    console.log('事件映射表已加载:', eventMapping);  // 打印 Event.json 数据
    console.log('社团映射表已加载:', ClubMapping);  // 打印 Club.json 数据
    console.log('学校映射表已加载:', SchoolMapping);  // 打印 School.json 数据
    translatePage(); // 页面加载后立即翻译一次
  })
  .catch(error => console.error('加载词汇映射表或学生映射表时出错:', error));

// 翻译函数，使用字典和学生映射表中的对应翻译
function translateVocabulary(originalText) {
  let translatedText = originalText;

  // 遍历词汇映射表，替换匹配的韩文单字
  for (let [koreanWord, chineseWord] of Object.entries(dictionary)) {
    let regex;

    // 检查是否是单字并且需要处理数字边界
    if (koreanWord.includes("(單字)")) {
      const cleanKoreanWord = koreanWord.replace("(單字)", "").trim();
      // 匹配左右任意一边是数字的情况，或单独的字
      regex = new RegExp(`(?<=\\d)${cleanKoreanWord}|${cleanKoreanWord}(?=\\d)`, 'g');
    } else {
      // 正常替换其他单词
      regex = new RegExp(koreanWord.trim(), 'gi');
    }

    // 进行替换
    translatedText = translatedText.replace(regex, chineseWord);
  }

  return translatedText;
}

function translateStudentNames(originalText) {
  let translatedText = originalText;

  // 处理带括号的名字，先翻译不带括号的部分
  const sortedStudentMapping = Object.entries(studentMapping)
    .sort(([a], [b]) => b.length - a.length); // 按照长度从长到短排序

  // 遍历所有学生映射，处理括号内外的情况
  for (let [koreanName, chineseName] of sortedStudentMapping) {
    let cleanKoreanName = koreanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // 转义括号等特殊字符

    // 正则表达式匹配括号及括号内容
    const regexWithParens = new RegExp(`(${cleanKoreanName})(\\([^\\)]+\\))?`, 'gi');
    translatedText = translatedText.replace(regexWithParens, (match, p1, p2) => {
      let translated = chineseName; // 翻译基本名字
      if (p2) { // 如果有括号，处理括号内容
        translated += p2.replace(/[\uac00-\ud7af]/g, (char) => studentMapping[char] || char);
      }
      return translated;
    });
  }

  return translatedText;
}



function translateText(originalText) {
  let translatedText = translateVocabulary(originalText); // 先翻译词汇
  translatedText = translateStudentNames(translatedText); // 再翻译学生名称

  return translatedText;
}

// 分批翻译函数，处理少量节点
function translateBatch(nodes) {
  nodes.forEach(node => {
    node.textContent = translateText(node.textContent);
  });
}

// 翻译整个页面内容，使用分批翻译
function translatePage() {
  if (isTranslating) return; // 防止重复调用
  isTranslating = true;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  let node;

  // 遍历页面上的所有文本节点并存储
  while (node = walker.nextNode()) {
    nodes.push(node);
  }

  const batchSize = 50; // 每次翻译的节点数量
  let index = 0;

  function processBatch() {
    if (index < nodes.length) {
      const batch = nodes.slice(index, index + batchSize);
      translateBatch(batch);
      index += batchSize;
      requestAnimationFrame(processBatch); // 使用 requestAnimationFrame 分帧处理，防止页面卡顿
    } else {
      isTranslating = false; // 翻译完成
    }
  }

  processBatch();
}

// 使用节流优化的 MutationObserver，限制频率
let observerThrottle;
const throttledObserver = () => {
  if (!observerThrottle) {
    observerThrottle = setTimeout(() => {
      translatePage();
      observerThrottle = null;
    }, 500); // 节流 500ms
  }
};

// 使用 MutationObserver 监听页面内容的变化（如动态加载的内容）
const observer = new MutationObserver((mutationsList) => {
  for (let mutation of mutationsList) {
    if (mutation.type === 'childList') {
      // 当 DOM 变化时，重新翻译页面
      throttledObserver();
    }
  }
});

// 开始观察 body 节点，监听子元素的变化
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 当页面加载完成时自动翻译一次
document.addEventListener('DOMContentLoaded', () => {
  translatePage();
});
