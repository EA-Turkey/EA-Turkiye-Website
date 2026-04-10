document.addEventListener("DOMContentLoaded", () => {
  const searchRoot = document.querySelector("[data-search-root]");

  if (!searchRoot) {
    return;
  }

  const searchPanel = searchRoot.querySelector("[data-search-panel]");
  const searchForm = searchRoot.querySelector("[data-search-form]");
  const searchInput = searchRoot.querySelector("[data-search-input]");
  const searchResults = searchRoot.querySelector("[data-search-results]");
  const searchTemplate = searchRoot.querySelector("[data-search-result-template]");
  const searchGroupTemplate = searchRoot.querySelector("[data-search-group-template]");
  const searchEmpty = searchRoot.querySelector("[data-search-empty]");
  const searchLoading = searchRoot.querySelector("[data-search-loading]");
  const searchNoResults = searchRoot.querySelector("[data-search-no-results]");
  const searchError = searchRoot.querySelector("[data-search-error]");
  const filterButtons = Array.from(searchRoot.querySelectorAll("[data-search-filter]"));
  const suggestionButtons = Array.from(searchRoot.querySelectorAll("[data-search-suggestion]"));
  const searchOpenButtons = document.querySelectorAll("[data-search-open]");
  const searchCloseButtons = searchRoot.querySelectorAll("[data-search-close]");
  const locale = searchRoot.dataset.searchLocale || document.documentElement.lang || "tr-TR";
  const searchIndexUrl = searchRoot.dataset.searchIndexUrl;
  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  const bodyChildren = Array.from(document.body.children).filter(
    (element) => element instanceof HTMLElement && element !== searchRoot && element.tagName !== "SCRIPT"
  );

  let activeTrigger = null;
  let activeFilter = "all";
  let searchIndex = null;
  let searchIndexPromise = null;
  let searchHasError = false;
  let knownCities = [];

  const setInertState = (isInert) => {
    bodyChildren.forEach((element) => {
      element.inert = isInert;
    });
  };

  const rawConfig = (() => {
    if (!searchRoot.dataset.searchConfig) {
      return {};
    }

    try {
      return JSON.parse(searchRoot.dataset.searchConfig);
    } catch (error) {
      return {};
    }
  })();

  const foldCharacter = (character) => {
    const asciiMap = {
      ç: "c",
      ğ: "g",
      ı: "i",
      ö: "o",
      ş: "s",
      ü: "u",
    };

    return asciiMap[character] || character;
  };

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const escapeHtml = (value) =>
    (value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const normalizeWithMap = (value) => {
    const original = (value || "").toString();
    let normalized = "";
    const map = [];
    let lastWasSpace = true;
    let cursor = 0;

    for (const character of original) {
      const start = cursor;
      cursor += character.length;

      let folded = character.toLocaleLowerCase(locale).replace(/[çğıöşü]/g, foldCharacter);
      folded = folded.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      folded = folded.replace(/[^a-z0-9]/g, " ");

      for (const normalizedCharacter of folded) {
        const isSpace = /\s/.test(normalizedCharacter);

        if (isSpace) {
          if (lastWasSpace) {
            continue;
          }

          normalized += " ";
          map.push({ start, end: cursor });
          lastWasSpace = true;
          continue;
        }

        normalized += normalizedCharacter;
        map.push({ start, end: cursor });
        lastWasSpace = false;
      }
    }

    let trimStart = 0;
    let trimEnd = normalized.length;

    while (trimStart < trimEnd && normalized[trimStart] === " ") {
      trimStart += 1;
    }

    while (trimEnd > trimStart && normalized[trimEnd - 1] === " ") {
      trimEnd -= 1;
    }

    return {
      original,
      text: normalized.slice(trimStart, trimEnd),
      map: map.slice(trimStart, trimEnd),
    };
  };

  const normalizeText = (value) => normalizeWithMap(value).text;

  const normalizeList = (values) =>
    [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeText(value)).filter(Boolean))];

  const preparedConfig = (() => {
    const queryAliases = Object.entries(rawConfig.queryAliases || {})
      .map(([key, values]) => ({
        key: normalizeText(key),
        values: normalizeList(values),
      }))
      .filter((entry) => entry.key && entry.values.length);

    const intentTerms = Object.fromEntries(
      Object.entries(rawConfig.intentTerms || {}).map(([intent, values]) => [intent, normalizeList(values)])
    );

    const groupPriority = Array.isArray(rawConfig.groupPriority) ? rawConfig.groupPriority : [];
    const groupPriorityIndex = groupPriority.reduce((accumulator, key, index) => {
      accumulator[key] = index;
      return accumulator;
    }, {});

    const resultLimits = {
      all: Number(rawConfig.resultLimits && rawConfig.resultLimits.all) || 3,
      filtered: Number(rawConfig.resultLimits && rawConfig.resultLimits.filtered) || 8,
    };

    return {
      filters: Array.isArray(rawConfig.filters) ? rawConfig.filters : [],
      groupLabels: rawConfig.groupLabels || {},
      groupPriorityIndex,
      queryAliases,
      intentTerms,
      resultLimits,
    };
  })();

  const containsWord = (haystack, term) => {
    if (!haystack || !term) {
      return false;
    }

    return new RegExp(`(^|\\s)${escapeRegExp(term)}(?=\\s|$)`, "u").test(haystack);
  };

  const containsPhrase = (haystack, phrase) => {
    if (!haystack || !phrase) {
      return false;
    }

    return new RegExp(`(^|\\s)${escapeRegExp(phrase)}(?=\\s|$)`, "u").test(haystack);
  };

  const truncateText = (value, limit = 190) => {
    if (!value) {
      return "";
    }

    if (value.length <= limit) {
      return value;
    }

    return `${value.slice(0, limit).trimEnd()}...`;
  };

  const setFilter = (filterKey) => {
    activeFilter = filterKey || "all";

    filterButtons.forEach((button) => {
      const isActive = button.dataset.searchFilter === activeFilter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const prepareRecord = (record) => {
    const aliases = Array.isArray(record.aliases) ? record.aliases : [];
    const translationAliases = Array.isArray(record.translation_aliases) ? record.translation_aliases : [];
    const intentTags = Array.isArray(record.intent_tags) ? record.intent_tags : [];
    const summary = (record.summary || "").trim();
    const metadata = (record.metadata || "").trim();
    const content = (record.content || "").trim();
    const snippetSource = (record.snippet_source || "").trim();

    const prepared = {
      ...record,
      summary,
      metadata,
      content,
      snippet_source: snippetSource,
      aliases,
      translation_aliases: translationAliases,
      intent_tags: intentTags,
      _title: normalizeText(record.title),
      _summary: normalizeText(summary),
      _metadata: normalizeText(metadata),
      _content: normalizeText(content),
      _snippetSource: normalizeText(snippetSource),
      _typeLabel: normalizeText(record.type_label),
      _groupLabel: normalizeText(record.group_label),
      _aliases: normalizeList(aliases),
      _translationAliases: normalizeList(translationAliases),
      _intentTags: normalizeList(intentTags),
      _city: normalizeText(record.city),
      _eventMode: normalizeText(record.event_mode),
    };

    prepared._combined = [
      prepared._title,
      prepared._summary,
      prepared._metadata,
      prepared._content,
      prepared._snippetSource,
      prepared._typeLabel,
      prepared._groupLabel,
      prepared._city,
      prepared._eventMode,
      ...prepared._aliases,
      ...prepared._translationAliases,
      ...prepared._intentTags,
    ]
      .filter(Boolean)
      .join(" ");

    return prepared;
  };

  const setState = (state) => {
    const isResults = state === "results";

    searchEmpty.hidden = state !== "empty";
    searchLoading.hidden = state !== "loading";
    searchNoResults.hidden = state !== "no-results";
    searchError.hidden = state !== "error";
    searchResults.hidden = !isResults;
  };

  const clearResults = () => {
    searchResults.innerHTML = "";
  };

  const getFieldMatchScore = (value, term, weights) => {
    if (!value || !term) {
      return 0;
    }

    let score = 0;
    const allowPartial = term.length > 2;

    if (weights.exact && value === term) {
      score += weights.exact;
    }
    if (weights.startsWith && value.startsWith(term)) {
      score += weights.startsWith;
    }
    if (weights.word && containsWord(value, term)) {
      score += weights.word;
    } else if (allowPartial && weights.partial && value.includes(term)) {
      score += weights.partial;
    }

    return score;
  };

  const getPhraseMatchScore = (value, phrase, weights) => {
    if (!value || !phrase) {
      return 0;
    }

    if (containsPhrase(value, phrase)) {
      return weights.word || 0;
    }

    if (phrase.length > 2 && value.includes(phrase)) {
      return weights.partial || 0;
    }

    return 0;
  };

  const expandQuery = (normalizedQuery, queryTerms) => {
    const phrases = new Set(normalizedQuery ? [normalizedQuery] : []);
    const expandedTerms = new Set(queryTerms);
    const appliedAliases = new Set();
    let changed = true;
    let passes = 0;

    while (changed && passes < 4) {
      changed = false;
      passes += 1;

      preparedConfig.queryAliases.forEach((aliasEntry) => {
        if (appliedAliases.has(aliasEntry.key)) {
          return;
        }

        const matchesAlias =
          containsPhrase(normalizedQuery, aliasEntry.key) ||
          expandedTerms.has(aliasEntry.key) ||
          [...phrases].some((phrase) => phrase === aliasEntry.key || containsPhrase(phrase, aliasEntry.key));

        if (!matchesAlias) {
          return;
        }

        appliedAliases.add(aliasEntry.key);
        phrases.add(aliasEntry.key);

        aliasEntry.values.forEach((value) => {
          phrases.add(value);
          value.split(" ").filter(Boolean).forEach((term) => {
            expandedTerms.add(term);
          });
        });

        changed = true;
      });
    }

    return {
      phrases: [...phrases].filter(Boolean),
      terms: [...expandedTerms].filter(Boolean),
    };
  };

  const detectIntents = (normalizedQuery, expandedPhrases, expandedTerms) => {
    const intents = new Set();
    const matchedCities = new Set();
    const searchablePhrases = [normalizedQuery, ...expandedPhrases].filter(Boolean);

    Object.entries(preparedConfig.intentTerms).forEach(([intent, values]) => {
      const hasIntentMatch = values.some((value) => {
        if (!value) {
          return false;
        }

        if (expandedTerms.includes(value)) {
          return true;
        }

        return searchablePhrases.some((phrase) => containsPhrase(phrase, value));
      });

      if (hasIntentMatch) {
        intents.add(intent);
      }
    });

    knownCities.forEach((city) => {
      const matchesCity =
        expandedTerms.includes(city) || searchablePhrases.some((phrase) => containsPhrase(phrase, city));

      if (matchesCity) {
        matchedCities.add(city);
      }
    });

    if (matchedCities.size) {
      intents.add("city");
    }

    return {
      intents,
      matchedCities: [...matchedCities],
    };
  };

  const buildSearchContext = (query) => {
    const normalizedQuery = normalizeText(query);
    const queryTerms = [...new Set(normalizedQuery.split(" ").filter(Boolean))];
    const expansion = expandQuery(normalizedQuery, queryTerms);
    const intentState = detectIntents(normalizedQuery, expansion.phrases, expansion.terms);
    const highlightTerms = [...new Set([normalizedQuery, ...queryTerms, ...expansion.phrases, ...expansion.terms])]
      .filter((term) => term && term.length > 1)
      .sort((left, right) => right.length - left.length);

    return {
      normalizedQuery,
      queryTerms,
      expandedPhrases: expansion.phrases,
      expandedTerms: expansion.terms,
      highlightTerms,
      intents: intentState.intents,
      matchedCities: intentState.matchedCities,
    };
  };

  const scoreItem = (item, context) => {
    let score = 0;
    let matchedDirectTerms = 0;
    let matchedExpandedTerms = 0;
    const hasAiSafetyQuery = [context.normalizedQuery, ...context.expandedPhrases].some((phrase) =>
      ["ai safety", "yapay zeka", "yapay zekâ", "yapay zeka guvenligi", "yapay zekâ güvenliği"].some((term) =>
        containsPhrase(phrase, term)
      )
    );

    if (context.normalizedQuery) {
      score += getPhraseMatchScore(item._title, context.normalizedQuery, { word: 220, partial: 150 });
      score += getPhraseMatchScore(item._aliases.join(" "), context.normalizedQuery, { word: 156, partial: 96 });
      score += getPhraseMatchScore(item._translationAliases.join(" "), context.normalizedQuery, { word: 138, partial: 90 });
      score += getPhraseMatchScore(item._summary, context.normalizedQuery, { word: 118, partial: 70 });
      score += getPhraseMatchScore(item._metadata, context.normalizedQuery, { word: 96, partial: 60 });
      score += getPhraseMatchScore(item._snippetSource, context.normalizedQuery, { word: 82, partial: 44 });
      score += getPhraseMatchScore(item._content, context.normalizedQuery, { word: 46, partial: 24 });
    }

    context.queryTerms.forEach((term) => {
      let termScore = 0;

      termScore += getFieldMatchScore(item._title, term, { exact: 168, startsWith: 72, word: 62, partial: 34 });
      termScore += getFieldMatchScore(item._summary, term, { word: 42, partial: 24 });
      termScore += getFieldMatchScore(item._metadata, term, { word: 38, partial: 22 });
      termScore += getFieldMatchScore(item._typeLabel, term, { word: 28, partial: 14 });
      termScore += getFieldMatchScore(item._groupLabel, term, { word: 24, partial: 12 });
      termScore += item._aliases.reduce(
        (sum, value) => sum + getFieldMatchScore(value, term, { exact: 60, startsWith: 34, word: 52, partial: 28 }),
        0
      );
      termScore += item._translationAliases.reduce(
        (sum, value) => sum + getFieldMatchScore(value, term, { exact: 54, startsWith: 30, word: 48, partial: 26 }),
        0
      );
      termScore += getFieldMatchScore(item._snippetSource, term, { word: 20, partial: 10 });
      termScore += getFieldMatchScore(item._content, term, { word: 14, partial: 7 });

      if (termScore > 0) {
        matchedDirectTerms += 1;
      }

      score += termScore;
    });

    context.expandedTerms
      .filter((term) => !context.queryTerms.includes(term))
      .forEach((term) => {
        let termScore = 0;

        termScore += getFieldMatchScore(item._title, term, { exact: 88, startsWith: 40, word: 34, partial: 20 });
        termScore += getFieldMatchScore(item._summary, term, { word: 26, partial: 14 });
        termScore += getFieldMatchScore(item._metadata, term, { word: 22, partial: 12 });
        termScore += item._aliases.reduce(
          (sum, value) => sum + getFieldMatchScore(value, term, { exact: 42, startsWith: 24, word: 28, partial: 18 }),
          0
        );
        termScore += item._translationAliases.reduce(
          (sum, value) => sum + getFieldMatchScore(value, term, { exact: 38, startsWith: 20, word: 24, partial: 16 }),
          0
        );
        termScore += getFieldMatchScore(item._snippetSource, term, { word: 12, partial: 6 });
        termScore += getFieldMatchScore(item._content, term, { word: 8, partial: 4 });

        if (termScore > 0) {
          matchedExpandedTerms += 1;
        }

        score += termScore;
      });

    if (score <= 0 || (!matchedDirectTerms && !matchedExpandedTerms)) {
      return null;
    }

    score += Number(item.section_priority || 0);

    if (
      item.translation_key === "ai-safety" &&
      (context.intents.has("ai-safety") || hasAiSafetyQuery || item._intentTags.includes("ai safety"))
    ) {
      score += 4000;
    }

    if (context.intents.has("newcomer") && (item.group_key === "get-involved" || item._intentTags.includes("newcomer"))) {
      score += 2000;
    }

    if (context.intents.has("event") && item.group_key === "events") {
      score += 150;
    }

    if (context.matchedCities.length && item.group_key === "events") {
      const cityMatch = context.matchedCities.some((city) => city === item._city || containsWord(item._metadata, city));

      if (cityMatch) {
        score += 210;
      }
    }

    if (context.intents.has("online") && item.group_key === "events") {
      const supportsOnline = [item._eventMode, item._city].some((value) =>
        ["online", "cevrimici", "hybrid"].includes(value)
      );

      if (supportsOnline) {
        score += item._eventMode === "online" ? 170 : 120;
      }
    }

    return {
      ...item,
      _score: score,
    };
  };

  const compareResults = (left, right) => {
    if (right._score !== left._score) {
      return right._score - left._score;
    }

    if (right.timestamp !== left.timestamp) {
      return right.timestamp - left.timestamp;
    }

    return left.title.localeCompare(right.title, locale);
  };

  const applyUpcomingEventBoost = (results, context) => {
    const eventIntentActive =
      context.intents.has("event") ||
      context.intents.has("city") ||
      context.intents.has("online") ||
      context.matchedCities.length > 0;

    if (!eventIntentActive) {
      return results;
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const eventResults = results.filter((item) => item.group_key === "events" && Number(item.event_start_ts));
    const hasFutureMatchingEvent = eventResults.some((item) => Number(item.event_start_ts) * 1000 > now);

    return results.map((item) => {
      if (item.group_key !== "events" || !Number(item.event_start_ts)) {
        return item;
      }

      const eventTime = Number(item.event_start_ts) * 1000;
      const deltaDays = (eventTime - now) / dayMs;
      let eventBoost = 0;

      if (hasFutureMatchingEvent) {
        if (deltaDays > 0) {
          eventBoost += 220;
          eventBoost += Math.max(0, 96 - Math.min(deltaDays, 96));
        }
      } else {
        eventBoost += 88;
        eventBoost += Math.max(0, 72 - Math.min(Math.abs(deltaDays), 120) * 0.6);
      }

      return {
        ...item,
        _score: item._score + eventBoost,
      };
    });
  };

  const getHighlightRanges = (value, terms) => {
    const normalized = normalizeWithMap(value);
    const ranges = [];

    terms.forEach((term) => {
      if (!term) {
        return;
      }

      let fromIndex = 0;

      while (fromIndex < normalized.text.length) {
        const matchIndex = normalized.text.indexOf(term, fromIndex);

        if (matchIndex === -1) {
          break;
        }

        const beforeCharacter = normalized.text[matchIndex - 1];
        const afterCharacter = normalized.text[matchIndex + term.length];
        const needsBoundary = term.length <= 3;
        const hasStartBoundary = !beforeCharacter || beforeCharacter === " ";
        const hasEndBoundary = !afterCharacter || afterCharacter === " ";

        if (!needsBoundary || (hasStartBoundary && hasEndBoundary)) {
          const start = normalized.map[matchIndex] && normalized.map[matchIndex].start;
          const end = normalized.map[matchIndex + term.length - 1] && normalized.map[matchIndex + term.length - 1].end;

          if (typeof start === "number" && typeof end === "number" && end > start) {
            ranges.push({ start, end });
          }
        }

        fromIndex = matchIndex + term.length;
      }
    });

    if (!ranges.length) {
      return [];
    }

    ranges.sort((left, right) => left.start - right.start || left.end - right.end);

    return ranges.reduce((mergedRanges, range) => {
      const previousRange = mergedRanges[mergedRanges.length - 1];

      if (!previousRange || range.start > previousRange.end) {
        mergedRanges.push(range);
        return mergedRanges;
      }

      previousRange.end = Math.max(previousRange.end, range.end);
      return mergedRanges;
    }, []);
  };

  const highlightText = (value, terms) => {
    if (!value) {
      return "";
    }

    const ranges = getHighlightRanges(value, terms);

    if (!ranges.length) {
      return escapeHtml(value);
    }

    let cursor = 0;
    let output = "";

    ranges.forEach((range) => {
      output += escapeHtml(value.slice(cursor, range.start));
      output += `<mark class="search-highlight">${escapeHtml(value.slice(range.start, range.end))}</mark>`;
      cursor = range.end;
    });

    output += escapeHtml(value.slice(cursor));
    return output;
  };

  const getBestSnippet = (item, context) => {
    const candidates = [item.summary, item.metadata, item.snippet_source, item.content]
      .filter(Boolean)
      .map((value, index) => ({ value, index }));

    if (!candidates.length) {
      return "";
    }

    let bestCandidate = candidates[0];
    let bestScore = -1;
    let bestMatchIndex = Number.POSITIVE_INFINITY;
    let bestMatchLength = 0;

    candidates.forEach((candidate) => {
      const normalizedCandidate = normalizeWithMap(candidate.value);
      let candidateScore = 0;
      let candidateMatchIndex = Number.POSITIVE_INFINITY;
      let candidateMatchLength = 0;

      context.highlightTerms.forEach((term) => {
        if (!term) {
          return;
        }

        const matchIndex = normalizedCandidate.text.indexOf(term);

        if (matchIndex === -1) {
          return;
        }

        candidateScore += term.length > 3 ? 24 : 14;

        if (matchIndex < candidateMatchIndex) {
          candidateMatchIndex = matchIndex;
          candidateMatchLength = term.length;
        }
      });

      if (candidateScore > bestScore || (candidateScore === bestScore && candidate.index < bestCandidate.index)) {
        bestCandidate = candidate;
        bestScore = candidateScore;
        bestMatchIndex = candidateMatchIndex;
        bestMatchLength = candidateMatchLength;
      }
    });

    if (!Number.isFinite(bestMatchIndex) || !bestMatchLength) {
      return truncateText(bestCandidate.value, 190);
    }

    const normalizedCandidate = normalizeWithMap(bestCandidate.value);
    const startMap = normalizedCandidate.map[bestMatchIndex];
    const endMap = normalizedCandidate.map[bestMatchIndex + bestMatchLength - 1];

    if (!startMap || !endMap) {
      return truncateText(bestCandidate.value, 190);
    }

    const matchStart = startMap.start;
    const matchEnd = endMap.end;
    const source = bestCandidate.value;
    let snippetStart = Math.max(0, matchStart - 88);
    let snippetEnd = Math.min(source.length, matchEnd + 118);
    const boundaryPattern = /[.!?]\s|:\s/g;
    let boundaryMatch = null;
    let beforeBoundary = -1;
    let afterBoundary = -1;

    while ((boundaryMatch = boundaryPattern.exec(source)) !== null) {
      if (boundaryMatch.index < matchStart) {
        beforeBoundary = boundaryMatch.index + boundaryMatch[0].length;
      } else if (afterBoundary === -1) {
        afterBoundary = boundaryMatch.index + 1;
        break;
      }
    }

    if (beforeBoundary !== -1 && matchStart - beforeBoundary < 120) {
      snippetStart = beforeBoundary;
    }

    if (afterBoundary !== -1 && afterBoundary - matchEnd < 160) {
      snippetEnd = afterBoundary;
    }

    let snippet = source.slice(snippetStart, snippetEnd).trim();

    if (snippetStart > 0) {
      snippet = `...${snippet}`;
    }

    if (snippetEnd < source.length) {
      snippet = `${snippet}...`;
    }

    return truncateText(snippet, 210);
  };

  const renderResults = (results, context) => {
    const fragment = document.createDocumentFragment();
    const resultLimit = activeFilter === "all" ? preparedConfig.resultLimits.all : preparedConfig.resultLimits.filtered;
    const filteredResults =
      activeFilter === "all" ? results : results.filter((item) => item.group_key === activeFilter);
    const groupedResults = new Map();

    clearResults();

    filteredResults.forEach((item) => {
      if (!groupedResults.has(item.group_key)) {
        groupedResults.set(item.group_key, []);
      }

      const bucket = groupedResults.get(item.group_key);

      if (bucket.length < resultLimit) {
        bucket.push(item);
      }
    });

    const groupEntries = [...groupedResults.entries()]
      .map(([groupKey, items]) => ({
        groupKey,
        items,
        topScore: items[0]._score,
        label: items[0].group_label || preparedConfig.groupLabels[groupKey] || items[0].type_label,
      }))
      .sort((left, right) => {
        if (right.topScore !== left.topScore) {
          return right.topScore - left.topScore;
        }

        return (preparedConfig.groupPriorityIndex[left.groupKey] ?? 999) - (preparedConfig.groupPriorityIndex[right.groupKey] ?? 999);
      });

    groupEntries.forEach((groupEntry) => {
      const groupNode = searchGroupTemplate.content.cloneNode(true);
      const groupTitle = groupNode.querySelector(".search-group__title");
      const groupResults = groupNode.querySelector(".search-group__results");

      groupTitle.textContent = groupEntry.label;

      groupEntry.items.forEach((item) => {
        const resultNode = searchTemplate.content.cloneNode(true);
        const link = resultNode.querySelector(".search-result__link");
        const chip = resultNode.querySelector(".search-result__chip");
        const date = resultNode.querySelector(".search-result__date");
        const title = resultNode.querySelector(".search-result__title");
        const summary = resultNode.querySelector(".search-result__summary");

        link.href = item.permalink;
        chip.textContent = item.type_label;
        title.innerHTML = highlightText(item.title, context.highlightTerms);
        summary.innerHTML = highlightText(getBestSnippet(item, context), context.highlightTerms);

        if (item.date_display) {
          date.hidden = false;
          date.textContent = item.date_display;
        }

        groupResults.appendChild(resultNode);
      });

      fragment.appendChild(groupNode);
    });

    searchResults.appendChild(fragment);
  };

  const runSearch = () => {
    const query = searchInput.value.trim();

    if (!query) {
      clearResults();
      setState(searchIndex ? "empty" : "loading");
      return;
    }

    if (searchHasError) {
      clearResults();
      setState("error");
      return;
    }

    if (!searchIndex) {
      clearResults();
      setState("loading");
      return;
    }

    const context = buildSearchContext(query);
    const results = applyUpcomingEventBoost(
      searchIndex.map((item) => scoreItem(item, context)).filter(Boolean),
      context
    ).sort(compareResults);

    const filteredResults =
      activeFilter === "all" ? results : results.filter((item) => item.group_key === activeFilter);

    if (!filteredResults.length) {
      clearResults();
      setState("no-results");
      return;
    }

    renderResults(results, context);
    setState("results");
  };

  const ensureIndex = () => {
    if (searchIndex || searchHasError) {
      return Promise.resolve(searchIndex);
    }

    if (searchIndexPromise) {
      return searchIndexPromise;
    }

    setState("loading");

    searchIndexPromise = fetch(searchIndexUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Search index request failed: ${response.status}`);
        }

        return response.json();
      })
      .then((records) => {
        searchIndex = records.map(prepareRecord);
        knownCities = [...new Set(searchIndex.map((item) => item._city).filter(Boolean))];
        runSearch();
        return searchIndex;
      })
      .catch(() => {
        searchHasError = true;
        setState("error");
        return null;
      });

    return searchIndexPromise;
  };

  const getFocusableElements = () =>
    Array.from(searchPanel.querySelectorAll(focusableSelector)).filter(
      (element) => !element.hasAttribute("hidden")
    );

  const closeSearch = () => {
    searchRoot.hidden = true;
    searchRoot.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-search-open");
    setInertState(false);
    clearResults();
    searchInput.value = "";
    setFilter("all");
    runSearch();

    if (activeTrigger && typeof activeTrigger.focus === "function") {
      activeTrigger.focus();
    }

    activeTrigger = null;
  };

  const openSearch = (trigger) => {
    const navToggle = document.querySelector("[data-nav-toggle]");

    if (document.body.classList.contains("is-nav-open") && navToggle instanceof HTMLElement) {
      navToggle.click();
    }

    activeTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
    searchRoot.hidden = false;
    searchRoot.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-search-open");
    setInertState(true);
    setState(searchIndex ? "empty" : "loading");
    ensureIndex();

    window.requestAnimationFrame(() => {
      searchInput.focus();
    });
  };

  setFilter(activeFilter);

  searchOpenButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openSearch(button);
    });
  });

  searchCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      closeSearch();
    });
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setFilter(button.dataset.searchFilter);
      runSearch();
    });
  });

  suggestionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      searchInput.value = button.dataset.searchSuggestion || button.textContent || "";
      ensureIndex();
      runSearch();
      searchInput.focus();
    });
  });

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch();
  });

  searchInput.addEventListener("input", () => {
    runSearch();
  });

  searchRoot.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements();

    if (!focusableElements.length) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  });
});
