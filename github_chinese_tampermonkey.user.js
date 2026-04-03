// ==UserScript==
// @name         GitHub 界面简体中文增强
// @namespace    https://github.com/
// @version      1.0.0
// @description  将 GitHub 常见界面元素尽可能翻译为简体中文（支持 SPA 动态页面）
// @author       GPT-5.2-Codex
// @match        https://github.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /** ----------------------------
   * 配置区
   * ---------------------------- */
  const CONFIG = {
    enabledKey: 'gh_zh_enabled',
    debugKey: 'gh_zh_debug',
    scanDebounceMs: 120,
  };

  let enabled = safeGetValue(CONFIG.enabledKey, true);
  let debug = safeGetValue(CONFIG.debugKey, false);

  /** ----------------------------
   * 翻译词典（可扩展）
   * 说明：
   * 1) 优先短语（长词优先），避免被单词规则误伤
   * 2) 同时支持精确匹配 + 大小写兼容
   * ---------------------------- */
  const DICT_EXACT = {
    'Pull requests': '拉取请求',
    'Pull Requests': '拉取请求',
    'New pull request': '新建拉取请求',
    'Merge pull request': '合并拉取请求',
    'Issues': '问题',
    'New issue': '新建问题',
    'Actions': '操作',
    'Projects': '项目',
    'Wiki': '维基',
    'Security': '安全',
    'Insights': '洞察',
    'Settings': '设置',
    'Releases': '发布',
    'Compare': '对比',
    'Commit': '提交',
    'Commits': '提交记录',
    'Branches': '分支',
    'Branch': '分支',
    'Tags': '标签',
    'Tag': '标签',
    'Discussions': '讨论',
    'Star': '星标',
    'Unstar': '取消星标',
    'Fork': '复刻',
    'Watch': '关注',
    'Notifications': '通知',
    'Marketplace': '市场',
    'Explore': '探索',
    'Open': '开放',
    'Closed': '已关闭',
    'Draft': '草稿',
    'Review': '审查',
    'Approve': '批准',
    'Request changes': '请求修改',
    'Conversation': '对话',
    'Checks': '检查',
    'Files changed': '更改的文件',
    'Author': '作者',
    'Labels': '标签',
    'Assignees': '指派对象',
    'Milestone': '里程碑',
    'Code': '代码',
    'Code review': '代码审查',
    'Reopen': '重新打开',
    'Create': '创建',
    'Cancel': '取消',
    'Close': '关闭',
    'Edit': '编辑',
    'Delete': '删除',
    'Save': '保存',
    'Search': '搜索',
    'Jump to': '跳转到',
    'Sign in': '登录',
    'Sign out': '退出登录',
    'Profile': '个人资料',
    'Your repositories': '你的仓库',
    'Your stars': '你的星标',
    'Your gists': '你的 Gist',
    'Repository': '仓库',
    'Repositories': '仓库',
    'Organization': '组织',
    'Organizations': '组织',
    'Pinned': '置顶',
    'Overview': '概览',
    'Readme': '说明文档',
    'Contributors': '贡献者',
    'Pulse': '脉搏',
    'Graph': '图表',
    'Traffic': '流量',
    'Forks': '复刻数',
    'Stars': '星标数',
    'Watching': '关注中',
    'Followers': '关注者',
    'Following': '正在关注',
    'Public': '公开',
    'Private': '私有',
    'Activity': '活动',
    'Latest': '最新',
    'Preview': '预览',
    'Submit': '提交',
    'Comment': '评论',
    'Comments': '评论',
    'Description': '描述',
    'Home': '首页',
    'Owner': '所有者',
    'Name': '名称',
    'Language': '语言',
    'License': '许可证',
  };

  const PHRASE_RULES = [
    ['new pull request', '新建拉取请求'],
    ['merge pull request', '合并拉取请求'],
    ['files changed', '更改的文件'],
    ['pull requests', '拉取请求'],
    ['request changes', '请求修改'],
    ['code review', '代码审查'],
    ['new issue', '新建问题'],
    ['sign out', '退出登录'],
    ['sign in', '登录'],
    ['jump to', '跳转到'],
    ['your repositories', '你的仓库'],
    ['your stars', '你的星标'],
    ['open', '开放'],
    ['closed', '已关闭'],
    ['draft', '草稿'],
    ['review', '审查'],
    ['approve', '批准'],
    ['conversation', '对话'],
    ['commits', '提交记录'],
    ['checks', '检查'],
    ['assignees', '指派对象'],
    ['milestone', '里程碑'],
    ['releases', '发布'],
    ['branches', '分支'],
    ['tags', '标签'],
    ['issues', '问题'],
    ['actions', '操作'],
    ['projects', '项目'],
    ['security', '安全'],
    ['insights', '洞察'],
    ['settings', '设置'],
    ['discussions', '讨论'],
    ['explore', '探索'],
    ['marketplace', '市场'],
    ['notifications', '通知'],
  ].sort((a, b) => b[0].length - a[0].length);

  const ATTRS_TO_TRANSLATE = ['title', 'aria-label', 'placeholder', 'data-tooltip'];

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'NOSCRIPT', 'SVG', 'PATH',
  ]);

  // 明显不应该翻译的容器：代码、markdown 主体、文件树等
  const SKIP_SELECTOR = [
    '.markdown-body',
    '.blob-wrapper',
    '.blob-code',
    '.js-file-line',
    '.react-code-text',
    '.highlight',
    '.commit-ref',
    '.commit-tease-sha',
    '.sha',
    '.Link--secondary[href*="/commit/"]',
    '.user-mention',
    '.avatar',
    '.js-navigation-item',
    '.Truncate-text',
    '.private',
  ].join(',');

  const processedTextNodes = new WeakSet();
  const processedElements = new WeakSet();

  let observer = null;
  let scanTimer = null;

  function safeGetValue(key, defaultValue) {
    try {
      return GM_getValue(key, defaultValue);
    } catch (err) {
      console.warn('[GH-ZH] 读取配置失败:', err);
      return defaultValue;
    }
  }

  function safeSetValue(key, value) {
    try {
      GM_setValue(key, value);
    } catch (err) {
      console.warn('[GH-ZH] 保存配置失败:', err);
    }
  }

  function log(...args) {
    if (debug) {
      console.log('[GH-ZH]', ...args);
    }
  }

  function registerMenus() {
    try {
      GM_registerMenuCommand(`翻译功能：${enabled ? '✅ 开启' : '❌ 关闭'}`, () => {
        enabled = !enabled;
        safeSetValue(CONFIG.enabledKey, enabled);
        console.info(`[GH-ZH] 翻译功能已${enabled ? '开启' : '关闭'}，刷新页面后完全生效。`);
        if (enabled) {
          scheduleProcess(document.body);
        }
      });

      GM_registerMenuCommand(`调试日志：${debug ? '✅ 开启' : '❌ 关闭'}`, () => {
        debug = !debug;
        safeSetValue(CONFIG.debugKey, debug);
        console.info(`[GH-ZH] 调试日志已${debug ? '开启' : '关闭'}。`);
      });
    } catch (err) {
      console.warn('[GH-ZH] 注册菜单失败:', err);
    }
  }

  /**
   * 判断元素/文本节点是否应该跳过，避免误翻译
   */
  function shouldSkipNodeByContext(node) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el) return true;

    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.closest(SKIP_SELECTOR)) return true;

    // 跳过隐藏区域
    if (el.closest('[aria-hidden="true"], [hidden], .sr-only')) return true;

    // 跳过可编辑区域（用户输入）
    if (el.closest('[contenteditable="true"], form textarea, form input')) return true;

    return false;
  }

  function looksLikeNonUiContent(text) {
    const trimmed = text.trim();
    if (!trimmed) return true;

    // 过长段落多半是正文（README/讨论正文等）
    if (trimmed.length > 120) return true;

    // SHA / 路径 / URL / 变量名倾向
    if (/^[a-f0-9]{7,40}$/i.test(trimmed)) return true;
    if (/^(https?:\/\/|\/|\.|#)/.test(trimmed)) return true;
    if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) return true;

    return false;
  }

  /**
   * 翻译纯文本
   * - 先精确匹配
   * - 再短语替换（大小写不敏感）
   */
  function translateText(text) {
    if (!enabled || !text) return text;

    const original = text;
    const trimmed = text.trim();
    if (!trimmed || looksLikeNonUiContent(trimmed)) return text;

    // 精确匹配（保留首尾空白）
    if (Object.prototype.hasOwnProperty.call(DICT_EXACT, trimmed)) {
      return original.replace(trimmed, DICT_EXACT[trimmed]);
    }

    let translated = original;

    // 短语优先（长短语先替换）
    for (const [en, zh] of PHRASE_RULES) {
      const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`\\b${escaped}\\b`, 'gi');
      translated = translated.replace(reg, (matched) => {
        // 全大写词保持更醒目样式
        if (matched === matched.toUpperCase() && matched.length > 1) {
          return zh.toUpperCase();
        }
        return zh;
      });
    }

    return translated;
  }

  /**
   * 翻译单个文本节点
   */
  function translateNode(node) {
    if (!enabled || !node || node.nodeType !== Node.TEXT_NODE) return;
    if (processedTextNodes.has(node)) return;
    if (shouldSkipNodeByContext(node)) return;

    const oldText = node.nodeValue;
    if (!oldText || !oldText.trim()) {
      processedTextNodes.add(node);
      return;
    }

    const newText = translateText(oldText);
    if (newText !== oldText) {
      node.nodeValue = newText;
      log('文本翻译:', oldText, '=>', newText);
    }

    processedTextNodes.add(node);
  }

  /**
   * 翻译元素属性（title / aria-label / placeholder / data-tooltip）
   */
  function translateElementAttributes(el) {
    if (!enabled || !el || el.nodeType !== Node.ELEMENT_NODE) return;
    if (shouldSkipNodeByContext(el)) return;

    for (const attr of ATTRS_TO_TRANSLATE) {
      if (!el.hasAttribute(attr)) continue;

      const oldVal = el.getAttribute(attr);
      if (!oldVal || looksLikeNonUiContent(oldVal)) continue;

      const newVal = translateText(oldVal);
      if (newVal !== oldVal) {
        el.setAttribute(attr, newVal);
        log(`属性翻译(${attr}):`, oldVal, '=>', newVal);
      }
    }
  }

  /**
   * 处理一个根节点（增量）
   * - TreeWalker 遍历文本节点
   * - 同时处理元素属性翻译
   */
  function processElement(root) {
    if (!enabled || !root) return;

    try {
      // 1) 根节点自身若是元素，先翻译其属性
      if (root.nodeType === Node.ELEMENT_NODE) {
        translateElementAttributes(root);
      }

      // 2) 遍历元素并翻译属性（去重）
      const elementWalker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            if (processedElements.has(node)) return NodeFilter.FILTER_SKIP;
            if (shouldSkipNodeByContext(node)) return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      let el = elementWalker.currentNode;
      while (el) {
        translateElementAttributes(el);
        processedElements.add(el);
        el = elementWalker.nextNode();
      }

      // 3) 遍历文本节点
      const textWalker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (processedTextNodes.has(node)) return NodeFilter.FILTER_REJECT;
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            if (shouldSkipNodeByContext(node)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      let textNode = textWalker.nextNode();
      while (textNode) {
        translateNode(textNode);
        textNode = textWalker.nextNode();
      }
    } catch (err) {
      console.warn('[GH-ZH] processElement 执行异常（已忽略）:', err);
    }
  }

  function scheduleProcess(root) {
    if (!enabled) return;
    if (scanTimer) {
      clearTimeout(scanTimer);
    }
    scanTimer = setTimeout(() => {
      processElement(root || document.body);
    }, CONFIG.scanDebounceMs);
  }

  /**
   * 监听动态变化（SPA / PJAX / MutationObserver）
   */
  function observePageChanges() {
    if (!enabled) return;

    // DOM 变更监听（只增量处理新增节点与变化元素）
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((n) => {
            if (n.nodeType === Node.TEXT_NODE) {
              translateNode(n);
            } else if (n.nodeType === Node.ELEMENT_NODE) {
              scheduleProcess(n);
            }
          });
        } else if (mutation.type === 'attributes') {
          const target = mutation.target;
          if (target && target.nodeType === Node.ELEMENT_NODE) {
            processedElements.delete(target);
            translateElementAttributes(target);
          }
        }
      }
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'placeholder', 'data-tooltip'],
    });

    // GitHub 常见事件：pjax 导航
    window.addEventListener('pjax:end', () => {
      log('pjax:end 触发，重新扫描');
      processedTextNodes.clear?.();
      scheduleProcess(document.body);
    });

    // 历史路由变更（pushState / replaceState / popstate / hashchange）
    const wrapHistoryMethod = (methodName) => {
      const original = history[methodName];
      if (typeof original !== 'function') return;
      history[methodName] = function (...args) {
        const ret = original.apply(this, args);
        window.dispatchEvent(new Event('gh-zh:urlchange'));
        return ret;
      };
    };

    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');

    window.addEventListener('popstate', () => window.dispatchEvent(new Event('gh-zh:urlchange')));
    window.addEventListener('hashchange', () => window.dispatchEvent(new Event('gh-zh:urlchange')));

    // 部分浏览器支持 onurlchange
    if ('onurlchange' in window) {
      window.addEventListener('urlchange', () => scheduleProcess(document.body));
    }

    window.addEventListener('gh-zh:urlchange', () => {
      log('URL 变化，重新扫描');
      scheduleProcess(document.body);
    });
  }

  /**
   * 初始化入口
   */
  function init() {
    try {
      registerMenus();

      if (!enabled) {
        console.info('[GH-ZH] 翻译功能当前关闭，可在 Tampermonkey 菜单开启。');
        return;
      }

      processElement(document.body);
      observePageChanges();
      log('初始化完成');
    } catch (err) {
      // 兜底：脚本异常不影响 GitHub 正常使用
      console.warn('[GH-ZH] 初始化失败（已忽略）:', err);
    }
  }

  init();
})();
