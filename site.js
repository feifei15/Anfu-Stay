const translations = {
  'Destinations': '目的地', 'Gallery': '相册', 'Guide': '指南', 'Book': '预订',
  'Stay somewhere with a point of view.': '住进一座城，也住进一种视角。',
  'Private, thoughtful residences shaped by their cities—from Shanghai and Hong Kong to what comes next.': '精心打造的城市居所，从上海、香港，到即将抵达的下一站。',
  'Explore destinations': '探索目的地', 'Anfu Stay Collection': '安福居系列',
  'One spirit.': '同一种精神，', 'Distinct cities.': '不同的城市。',
  'Anfu Stay brings together design-minded urban homes, direct local hosting and practical guest support. Choose a city to explore its residence, gallery, guide and booking calendar.': '安福居汇集注重设计的城市住所、本地主理人的直接接待与贴心的住客支持。选择一座城市，查看居所、相册、指南和预订日历。',
  'Shanghai': '上海', 'Hong Kong': '香港', 'Las Vegas': '拉斯维加斯',
  'A private residence in the Former French Concession, designed as a calm base for living in the city.': '位于原法租界的私享居所，为城市生活提供一处安静舒适的落脚点。',
  'A compact city stay connected to the energy, views and rhythm of Hong Kong.': '一处精巧的城市居所，让你贴近香港的活力、景色与节奏。',
  'The next Anfu Stay destination is taking shape.': '安福居的下一站正在成形。',
  'Explore Shanghai': '探索上海', 'Explore Hong Kong': '探索香港', 'Preview Las Vegas': '预览拉斯维加斯', 'Coming soon': '即将推出',
  'Anfu Stay · Shanghai': '安福居 · 上海', 'Anfu Stay · Hong Kong': '安福居 · 香港', 'Anfu Stay · Las Vegas': '安福居 · 拉斯维加斯',
  'Former French Concession · A private, light-filled home for experiencing Shanghai at your own pace.': '原法租界 · 一处明亮私密的家，让你按自己的节奏感受上海。',
  'Victoria Harbour · A simple, direct city stay with local support and flexible booking.': '维多利亚港 · 简洁自在的城市居所，提供本地支持与灵活预订。',
  'Book Shanghai': '预订上海', 'Book Hong Kong': '预订香港', 'View gallery': '查看相册',
  'A quieter way to live in Shanghai.': '在上海，住得更从容。',
  'Generous living space, a full kitchen and thoughtful support in one of the city’s most walkable neighborhoods. Explore the residence, plan your arrival and book directly.': '宽敞的起居空间、设备齐全的厨房与贴心支持，坐落于上海最宜步行探索的街区之一。查看居所、规划抵达并直接预订。',
  'Hong Kong, from a local point of view.': '从本地视角感受香港。',
  'A practical home base for two guests, with direct booking, clear arrival information and the city close at hand.': '适合两位住客的便利居所，支持直接预订，抵达信息清晰，城市精彩近在咫尺。',
  'All destinations': '全部目的地', 'Explore current stays': '探索现有居所',
  'Gallery, guide and direct booking will open when the residence is ready.': '居所准备就绪后，相册、指南和直接预订将同步开放。',
  'Views and details from the residence and its Shanghai setting.': '记录居所细节与上海周边景致。',
  'Hong Kong views and the visual character of the stay.': '香港景色与居所的独特风貌。',
  'Shanghai at sunset': '上海日落', 'Living space': '起居空间', 'Bedroom': '卧室', 'Evening view': '夜景', 'Residence interior': '居所内景', 'From the residence': '居所眺望',
  'Victoria Harbour': '维多利亚港', 'Hong Kong by day': '香港日景', 'Hong Kong by night': '香港夜景',
  'Connected living spaces': '连贯的居住空间', 'Private balcony': '私人阳台', 'The residence': '公寓所在建筑',
  'Bathroom and bedroom': '浴室与卧室', 'Bedroom workspace': '卧室办公区', 'Light-filled bedroom': '采光充足的卧室',
  'Full bathroom': '完整浴室', 'Open-plan living': '开放式起居空间', 'City panorama': '城市全景',
  'Living and dining': '起居与用餐空间', 'Living room and balcony': '客厅与阳台', 'Living room': '客厅',
  'Building exterior': '建筑外观', 'Kitchen and dining': '厨房与餐厅', 'Indoor-outdoor living': '室内外相连的起居空间',
  'Breakfast area': '早餐区', 'Full kitchen': '设备齐全的厨房', 'Kitchen details': '厨房细节',
  'Entrance and dining': '入口与用餐区', 'Second bedroom': '第二间卧室', 'Walk-in shower': '步入式淋浴间'
};

const originalText = new WeakMap();
const pageTitles = {
  'Anfu Stay · Boutique residences': '安福居 · 精品城市居所',
  'Anfu Stay · Shanghai': '安福居 · 上海', 'Anfu Stay · Hong Kong': '安福居 · 香港',
  'Anfu Stay · Las Vegas · Coming soon': '安福居 · 拉斯维加斯 · 即将推出',
  'Gallery · Anfu Stay Shanghai': '相册 · 安福居上海', 'Gallery · Anfu Stay Hong Kong': '相册 · 安福居香港'
};

function translateText(language) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue.trim() || node.parentElement?.closest('.language-switch,script,style')) continue;
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node);
    const key = source.trim();
    node.nodeValue = language === 'zh' && translations[key] ? source.replace(key, translations[key]) : source;
  }
}

function setLanguage(language) {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  translateText(language);
  const originalTitle = document.documentElement.dataset.originalTitle || document.title;
  document.documentElement.dataset.originalTitle = originalTitle;
  document.title = language === 'zh' ? (pageTitles[originalTitle] || originalTitle) : originalTitle;
  document.querySelectorAll('.language-switch button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === language)));
  localStorage.setItem('anfu-language', language);
}

const headerShell = document.querySelector('.site-header .shell');
if (headerShell) {
  const switcher = document.createElement('div');
  switcher.className = 'language-switch';
  switcher.setAttribute('aria-label', 'Language / 语言');
  switcher.innerHTML = '<button type="button" data-language="en">EN</button><button type="button" data-language="zh">中文</button>';
  headerShell.insertBefore(switcher, headerShell.querySelector('.site-nav'));
  switcher.addEventListener('click', event => {
    const button = event.target.closest('button[data-language]');
    if (button) setLanguage(button.dataset.language);
  });
}

document.querySelectorAll('[data-city-switch]').forEach(select => select.addEventListener('change', () => {
  const section = document.body.dataset.section || '';
  const city = select.value;
  location.href = city === 'las-vegas' ? '/las-vegas/' : `/${city}/${section ? `${section}/` : ''}`;
}));

setLanguage(localStorage.getItem('anfu-language') === 'zh' ? 'zh' : 'en');
