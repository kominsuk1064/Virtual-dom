/**
 * 벤치마크 시나리오 정의
 *
 * 목표:
 * - 숫자만 빠른/느린 비교가 아니라 "같은 사이트가 어떻게 갱신되는가"를 보여준다.
 * - 대표 이미지와 카드 썸네일이 포함된 사이트 형태를 만들어 차이가 눈에 띄게 한다.
 * - VDOM은 일부 카드만 바뀌고, DOM은 전체를 다시 그리는 비교에 적합한 구조를 유지한다.
 */

export const densityOptions = [
  { value: "light", label: "가볍게", cards: 4 },
  { value: "medium", label: "기본", cards: 8 },
  { value: "heavy", label: "강하게", cards: 16 },
];

const densityMap = new Map(densityOptions.map((option) => [option.value, option]));

function getDensity(optionValue) {
  return densityMap.get(optionValue) ?? densityMap.get("medium");
}

function text(content) {
  return { type: "#text", text: String(content) };
}

function element(type, props = {}, children = []) {
  return {
    type,
    props,
    children: children.filter(Boolean),
  };
}

function svgDataUrl(markup) {
  return `data:image/svg+xml,${encodeURIComponent(markup)}`;
}

function buildArtwork({ label, icon, start, end, accent, detail = "#ffffff" }) {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 360">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${start}" />
          <stop offset="1" stop-color="${end}" />
        </linearGradient>
      </defs>
      <rect width="560" height="360" rx="30" fill="url(#g)" />
      <circle cx="458" cy="96" r="66" fill="${detail}" fill-opacity="0.14" />
      <circle cx="108" cy="286" r="92" fill="${detail}" fill-opacity="0.08" />
      <path d="M62 250C132 176 194 148 254 162C314 176 364 236 470 222" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/>
      <path d="M78 126C132 88 188 70 250 74C312 78 360 112 418 136" fill="none" stroke="${detail}" stroke-opacity="0.44" stroke-width="10" stroke-linecap="round"/>
      <rect x="44" y="36" width="124" height="42" rx="14" fill="${detail}" fill-opacity="0.16" />
      <text x="62" y="64" fill="${detail}" font-size="26" font-family="Arial, sans-serif">${icon}</text>
      <text x="44" y="316" fill="${detail}" font-size="44" font-weight="700" font-family="Arial, sans-serif">${label}</text>
      <text x="44" y="346" fill="${detail}" fill-opacity="0.84" font-size="18" font-family="Arial, sans-serif">VISUAL BENCHMARK SCENE</text>
    </svg>
  `);
}

function makeHeroState(scene, updatePacket) {
  if (updatePacket) {
    return {
      eyebrow: updatePacket.eyebrow ?? scene.modifiedEyebrow,
      title: updatePacket.title ?? scene.modifiedTitle,
      summary: updatePacket.summary ?? scene.modifiedSummary,
      badge: updatePacket.badge ?? scene.modifiedBadge,
      action: updatePacket.action ?? scene.modifiedAction,
      tone: updatePacket.tone ?? scene.modifiedTone,
      art: buildArtwork(updatePacket.artwork ?? scene.modifiedArtwork),
    };
  }

  return {
    eyebrow: scene.eyebrow,
    title: scene.title,
    summary: scene.summary,
    badge: scene.badge,
    action: scene.action,
    tone: scene.tone,
    art: buildArtwork(scene.artwork),
  };
}

function formatIndex(index) {
  return String(index + 1).padStart(2, "0");
}

function makeCard(seed, scene, index) {
  const suffix = formatIndex(index);
  return {
    key: `${scene.id}-${seed.slug}-${index}`,
    title: `${seed.title} ${suffix}`,
    excerpt: seed.excerpt,
    badge: seed.badge,
    meta: `${seed.meta} · ${suffix}`,
    tone: seed.tone,
    art: buildArtwork({
      label: seed.label,
      icon: seed.icon,
      start: seed.start,
      end: seed.end,
      accent: seed.accent,
      detail: seed.detail,
    }),
    cta: seed.cta,
  };
}

function buildPacketChangeText(updatePacket) {
  const mutationCount = updatePacket?.mutationIndexes?.length ?? 0;
  const parts = ["배너 1"];

  if (mutationCount > 0) {
    parts.push(`카드 ${mutationCount}`);
  }

  if (updatePacket?.includeInsert) {
    parts.push("신규 1");
  }

  return parts.join(" + ");
}

function makePacketDescription(scene, mutationIndexes, includeInsert) {
  const labels = mutationIndexes.map((index) => scene.mutations[index]?.title).filter(Boolean);

  if (includeInsert && scene.insertedCard?.title) {
    labels.push(scene.insertedCard.title);
  }

  if (labels.length === 0) {
    return `${scene.name}의 일부 상태와 카드가 새 데이터로 갱신됩니다.`;
  }

  if (labels.length === 1) {
    return `${labels[0]} 데이터가 새로 도착했습니다.`;
  }

  return `${labels.slice(0, 2).join(" / ")} 중심으로 새 데이터가 도착했습니다.`;
}

function buildDefaultUpdatePackets(scene) {
  const packets = [
    {
      id: `${scene.id}-burst-a`,
      label: scene.mutations[0]?.title ?? `${scene.name} 핵심 카드 갱신`,
      description: makePacketDescription(scene, [0, 1].filter((index) => scene.mutations[index]), false),
      focusAfter: `${scene.focusAfter} · 핵심 카드`,
      mutationIndexes: [0, 1].filter((index) => scene.mutations[index]),
      includeInsert: false,
    },
    {
      id: `${scene.id}-burst-b`,
      label: scene.insertedCard?.title ?? `${scene.name} 신규 카드 수신`,
      description: makePacketDescription(scene, [1, 2].filter((index) => scene.mutations[index]), true),
      focusAfter: `${scene.focusAfter} · 신규 카드 포함`,
      mutationIndexes: [1, 2].filter((index) => scene.mutations[index]),
      includeInsert: true,
      title: `${scene.modifiedTitle} · 신규 카드 수신`,
      badge: "새 데이터 도착",
      action: "데이터 반영",
    },
    {
      id: `${scene.id}-burst-c`,
      label: `${scene.name} 상태 재정렬`,
      description: makePacketDescription(scene, [0, 2, 3].filter((index) => scene.mutations[index]), false),
      focusAfter: `${scene.focusAfter} · 상태 재정렬`,
      mutationIndexes: [0, 2, 3].filter((index) => scene.mutations[index]),
      includeInsert: false,
      title: `${scene.modifiedTitle} · 상태 재정렬`,
      badge: "갱신 묶음",
      action: "묶음 반영",
    },
  ];

  return packets.filter((packet) => packet.mutationIndexes.length > 0 || packet.includeInsert);
}

function buildCardList(scene, density, updatePacket) {
  const cards = Array.from({ length: density.cards }, (_, index) => {
    const seed = scene.cardSeeds[index % scene.cardSeeds.length];
    return makeCard(seed, scene, index);
  });

  if (updatePacket) {
    const selectedMutations = (updatePacket.mutationIndexes ?? scene.mutations.map((_, index) => index))
      .map((index) => scene.mutations[index])
      .filter(Boolean);

    selectedMutations.forEach((mutation, mutationOrder) => {
      const fallbackIndex = cards.length
        ? Math.min(cards.length - 1, Math.floor(((mutationOrder + 1) * cards.length) / (selectedMutations.length + 1)))
        : 0;
      const targetIndex = mutation.index < cards.length ? mutation.index : fallbackIndex;
      const target = cards[targetIndex];
      if (!target) return;
      Object.assign(target, {
        title: mutation.title,
        excerpt: mutation.excerpt,
        badge: mutation.badge,
        meta: mutation.meta,
        tone: mutation.tone,
        art: buildArtwork(mutation.artwork),
        cta: mutation.cta ?? target.cta,
        isUpdated: true,
        changeLabel: "✓",
      });
    });

    if (updatePacket.includeInsert && scene.insertedCard) {
      const inserted = updatePacket.insertedCard ?? scene.insertedCard;
      const insertionIndex = Math.min(updatePacket.insertAt ?? scene.insertAt, cards.length);

      cards.splice(insertionIndex, 0, {
        key: `${scene.id}-${updatePacket.id}-inserted`,
        title: inserted.title,
        excerpt: inserted.excerpt,
        badge: inserted.badge,
        meta: inserted.meta,
        tone: inserted.tone,
        art: buildArtwork(inserted.artwork),
        cta: inserted.cta,
        isInserted: true,
        changeLabel: "✓",
      });
    }
  }

  return cards;
}

function createStatNode(stat, index) {
  return element(
    "article",
    {
      class: "bench-site__stat",
      "data-bench-id": `stat-${index}`,
      key: `stat-${index}`,
    },
    [
      element("span", { class: "bench-site__stat-label" }, [text(stat.label)]),
      element("strong", { class: "bench-site__stat-value" }, [text(stat.value)]),
    ]
  );
}

function createCardNode(card, index) {
  const cardId = `card-${card.key}`;
  const cardClasses = [
    "bench-site__card",
    `bench-site__card--${card.tone}`,
    card.isUpdated ? "bench-site__card--changed" : "",
    card.isInserted ? "bench-site__card--inserted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return element(
    "article",
    {
      class: cardClasses,
      key: card.key,
      "data-bench-id": cardId,
    },
    [
      element("div", { class: "bench-site__card-image-wrap", "data-bench-id": `${cardId}-wrap` }, [
        card.changeLabel
          ? element("span", { class: "bench-site__change-chip", "data-bench-id": `${cardId}-change` }, [
              text(card.changeLabel),
            ])
          : null,
        element("img", {
          class: "bench-site__card-image",
          src: card.art,
          alt: `${card.title} 이미지`,
          "data-bench-id": `${cardId}-image`,
        }),
      ]),
      element("div", { class: "bench-site__card-body" }, [
        element("div", { class: "bench-site__card-topline" }, [
          element(
            "span",
            {
              class: `bench-site__badge bench-site__badge--${card.tone}`,
              "data-bench-id": `${cardId}-badge`,
            },
            [text(card.badge)]
          ),
          element("span", { class: "bench-site__meta", "data-bench-id": `${cardId}-meta` }, [text(card.meta)]),
        ]),
        element("h3", { class: "bench-site__card-title", "data-bench-id": `${cardId}-title` }, [text(card.title)]),
        element("p", { class: "bench-site__card-copy", "data-bench-id": `${cardId}-copy` }, [text(card.excerpt)]),
        element("button", { class: "bench-site__card-action", disabled: "true", type: "button" }, [text(card.cta)]),
      ]),
    ]
  );
}

function buildSceneVdom(scene, density, updatePacket) {
  const hero = makeHeroState(scene, updatePacket);
  const cards = buildCardList(scene, density, updatePacket);
  const statNodes = [
    { label: "보이는 카드", value: `${cards.length}개` },
    { label: "예상 변화", value: updatePacket ? updatePacket.changeCountText ?? buildPacketChangeText(updatePacket) : "0개" },
    { label: "관찰 포인트", value: updatePacket ? updatePacket.focusAfter ?? scene.focusAfter : scene.focusBefore },
  ];
  return element("section", { class: "bench-site", "data-bench-scene": scene.id, "data-bench-density": density.value }, [
    element("header", { class: "bench-site__hero", "data-bench-id": "hero-shell" }, [
      element("img", {
        class: "bench-site__hero-image",
        src: hero.art,
        alt: `${hero.title} 대표 이미지`,
        "data-bench-id": "hero-image",
      }),
      element("div", { class: "bench-site__hero-content" }, [
        element("p", { class: "bench-site__eyebrow", "data-bench-id": "hero-eyebrow" }, [text(hero.eyebrow)]),
        element("h2", { class: "bench-site__hero-title", "data-bench-id": "hero-title" }, [text(hero.title)]),
        element("p", { class: "bench-site__hero-copy", "data-bench-id": "hero-copy" }, [text(hero.summary)]),
        element("div", { class: "bench-site__hero-actions" }, [
          element(
            "span",
            {
              class: `bench-site__hero-badge bench-site__hero-badge--${hero.tone}`,
              "data-bench-id": "hero-badge",
            },
            [text(hero.badge)]
          ),
          element("button", { class: "bench-site__hero-button", type: "button", disabled: "true" }, [text(hero.action)]),
        ]),
      ]),
    ]),

    element("section", { class: "bench-site__stats" }, statNodes.map((stat, index) => createStatNode(stat, index))),

    element("section", { class: "bench-site__grid" }, cards.map((card, index) => createCardNode(card, index))),

    element("section", { class: "bench-site__rail", "data-bench-id": "site-rail" }, [
      element("span", { class: "bench-site__rail-item" }, [text(scene.railLead)]),
      element("span", { class: "bench-site__rail-item" }, [text(scene.railMiddle)]),
      element("span", { class: "bench-site__rail-item" }, [text(updatePacket ? scene.railTailModified : scene.railTail)]),
    ]),
  ]);
}

function prepareScenarioRun(scene, density) {
  const packets = scene.updatePackets ?? buildDefaultUpdatePackets(scene);
  const selectedPacket = packets[Math.floor(Math.random() * packets.length)];
  const now = new Date();
  const receivedAt = now.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const packet = {
    ...selectedPacket,
    changeCountText: selectedPacket.changeCountText ?? buildPacketChangeText(selectedPacket),
    focusAfter: selectedPacket.focusAfter ?? scene.focusAfter,
    receivedAt,
    batchId: `${scene.id.toUpperCase()}-${String(Math.floor(Math.random() * 900) + 100)}`,
  };

  return {
    initialVdom: buildSceneVdom(scene, density, null),
    modifiedVdom: buildSceneVdom(scene, density, packet),
    packet,
  };
}

const sceneDefinitions = [
  {
    id: "newsroom",
    name: "속보 뉴스룸",
    icon: "📡",
    description: "대표 배너 1장과 기사 카드 일부만 바뀌는 상황을 눈으로 비교합니다.",
    focusBefore: "안정된 송출",
    focusAfter: "일부 카드만 갱신",
    changeCountText: "배너 1 + 카드 5",
    railLead: "초기 상태: 일반 편성 유지",
    railMiddle: "변경 포인트: 배너/배지/기사 카드 일부",
    railTail: "결과: 전체 DOM은 모두 다시 그림",
    railTailModified: "결과: VDOM은 필요한 카드만 패치",
    eyebrow: "CITY DESK",
    title: "도심 감시망 안정 편성",
    summary: "같은 사이트를 두 방식으로 갱신할 때, 뉴스룸의 어떤 부분이 실제로 바뀌는지 비교합니다.",
    badge: "정상 송출",
    action: "편성 대기",
    tone: "teal",
    artwork: { label: "CITY LIVE", icon: "📡", start: "#0F6272", end: "#4BB7C7", accent: "#F6E5A6", detail: "#F8F7F3" },
    modifiedEyebrow: "BREAKING FEED",
    modifiedTitle: "속보 편성으로 즉시 전환",
    modifiedSummary: "경보 발생 구역의 카드 몇 장과 헤드라인만 바뀌는데, DOM은 판 전체를 다시 그리고 VDOM은 바뀐 요소만 고칩니다.",
    modifiedBadge: "속보 전환",
    modifiedAction: "속보 송출",
    modifiedTone: "crimson",
    modifiedArtwork: { label: "BREAKING", icon: "🚨", start: "#7A1E22", end: "#DA704D", accent: "#FFE197", detail: "#FFF8EF" },
    insertAt: 3,
    insertedCard: {
      title: "현장 생중계 브리핑",
      excerpt: "새로운 카드가 중간에 추가될 때 전체를 갈아끼우는 방식과 부분 삽입 방식의 차이가 더 또렷하게 보입니다.",
      badge: "신규",
      meta: "방금 전 · 긴급 채널",
      tone: "gold",
      cta: "실시간 보기",
      artwork: { label: "LIVE", icon: "🎥", start: "#80520D", end: "#E3A52D", accent: "#FFF5D6", detail: "#FFF9ED" },
    },
    mutations: [
      {
        index: 1,
        title: "북문 추적 화면 이상 감지",
        excerpt: "카메라 피드 2개와 경고 배지가 동시에 바뀐 상황입니다.",
        badge: "속보",
        meta: "방금 전 · 북문",
        tone: "crimson",
        cta: "경보 확인",
        artwork: { label: "ALERT", icon: "🚨", start: "#7B2B2D", end: "#C35B49", accent: "#FFD694", detail: "#FFF8F0" },
      },
      {
        index: 4,
        title: "옥상 열원 패턴 급변",
        excerpt: "일부 카드만 강조되면 VDOM은 해당 카드만 반응하는 장면을 보여주기 좋습니다.",
        badge: "주의",
        meta: "1분 전 · 옥상",
        tone: "gold",
        cta: "패턴 보기",
        artwork: { label: "HEAT", icon: "🌡️", start: "#7B4A1E", end: "#E1913E", accent: "#FFF3C9", detail: "#FFF6EC" },
      },
      {
        index: 7,
        title: "남쪽 차선 통제 브리핑",
        excerpt: "배지, 메타, 액션 버튼까지 함께 바뀌는 카드입니다.",
        badge: "차단",
        meta: "2분 전 · 남쪽",
        tone: "purple",
        cta: "우회 안내",
        artwork: { label: "ROAD", icon: "🚧", start: "#3F2A74", end: "#7A61C2", accent: "#EDE7FF", detail: "#F7F3FF" },
      },
      {
        index: 10,
        title: "기동대 진입 허가 요청",
        excerpt: "문구 몇 개만 바뀌어도 DOM은 전체, VDOM은 일부만 다시 계산하는 차이를 설명할 수 있습니다.",
        badge: "승인",
        meta: "3분 전 · 기동대",
        tone: "teal",
        cta: "진입 확인",
        artwork: { label: "MOVE", icon: "🚓", start: "#0F5A64", end: "#31A3AB", accent: "#DFF7F5", detail: "#F5FFFE" },
      },
    ],
    cardSeeds: [
      { slug: "north", title: "북문 추적 피드", excerpt: "도심 주요 카메라 상태가 안정적으로 유지되고 있습니다.", badge: "일반", meta: "11분 전", tone: "slate", cta: "기록 열람", label: "NORTH", icon: "📷", start: "#304352", end: "#5D768B", accent: "#D8E5F0", detail: "#F5FAFF" },
      { slug: "square", title: "광장 현장 스냅", excerpt: "현장 인파 분포와 움직임을 정리한 카드입니다.", badge: "관찰", meta: "9분 전", tone: "teal", cta: "현장 보기", label: "SQUARE", icon: "🛰️", start: "#0F6170", end: "#44AABB", accent: "#D4F5F4", detail: "#F8FFFE" },
      { slug: "alley", title: "골목 차량 흐름", excerpt: "차량 밀집도와 우회 가능 구간을 같이 보여줍니다.", badge: "교통", meta: "8분 전", tone: "gold", cta: "차선 확인", label: "ALLEY", icon: "🚕", start: "#77501B", end: "#D9A44A", accent: "#FFF0C8", detail: "#FFF9EE" },
      { slug: "roof", title: "옥상 열원 분포", excerpt: "열원 변화가 작게만 바뀌는 경우를 시각적으로 보여줍니다.", badge: "열원", meta: "7분 전", tone: "purple", cta: "분포 열람", label: "ROOF", icon: "🌇", start: "#42306C", end: "#8D76CB", accent: "#ECE6FF", detail: "#FAF7FF" },
      { slug: "lobby", title: "로비 출입 현황", excerpt: "출입 패턴과 태그 상태가 카드 안에서 함께 바뀝니다.", badge: "출입", meta: "6분 전", tone: "teal", cta: "출입 보기", label: "LOBBY", icon: "🏢", start: "#175A5E", end: "#62B8A6", accent: "#D8F7EA", detail: "#F7FFF7" },
      { slug: "bridge", title: "교량 드론 뷰", excerpt: "대표 이미지가 포함된 카드 몇 장만 바뀌는 장면을 만듭니다.", badge: "드론", meta: "5분 전", tone: "slate", cta: "드론 보기", label: "BRIDGE", icon: "🛸", start: "#30495E", end: "#7C97AE", accent: "#E1EBF4", detail: "#F6FAFD" },
    ],
  },
  {
    id: "travel-lab",
    name: "여행 추천 랩",
    icon: "🧭",
    description: "배너와 여행 카드 일부만 교체되는 추천 사이트 비교입니다.",
    focusBefore: "편안한 추천",
    focusAfter: "추천 카드 일부 교체",
    changeCountText: "배너 1 + 카드 5",
    railLead: "초기 상태: 추천 큐레이션 안정",
    railMiddle: "변경 포인트: 대표 이미지와 카드 일부",
    railTail: "결과: DOM은 전체 추천판 재구성",
    railTailModified: "결과: VDOM은 바뀐 카드만 반영",
    eyebrow: "TRAVEL LAB",
    title: "주말 산책용 여행 큐레이션",
    summary: "많은 카드 중 일부 추천만 바뀌는 상황을 통해, 실제 DOM 비용이 어디서 커지는지 보여줍니다.",
    badge: "부드러운 추천",
    action: "루트 저장",
    tone: "teal",
    artwork: { label: "WEEKEND", icon: "🧭", start: "#0E5B61", end: "#70B5A7", accent: "#F7EBC5", detail: "#FAFFFC" },
    modifiedEyebrow: "WEATHER ALERT",
    modifiedTitle: "날씨 반영으로 루트 재조정",
    modifiedSummary: "대표 배너, 카드 몇 장, 경고 배지 정도만 바뀌는 상황이라 부분 패치의 장점이 잘 보입니다.",
    modifiedBadge: "경로 재정비",
    modifiedAction: "대체 루트",
    modifiedTone: "gold",
    modifiedArtwork: { label: "REROUTE", icon: "⛈️", start: "#74511A", end: "#D89A2A", accent: "#FFF0B6", detail: "#FFF9EE" },
    insertAt: 2,
    insertedCard: {
      title: "날씨 우회 루트 추천",
      excerpt: "중간에 새 카드가 들어가도 VDOM은 필요한 자리만 끼워 넣는 장면을 강조할 수 있습니다.",
      badge: "신규",
      meta: "방금 전 · 우회 루트",
      tone: "crimson",
      cta: "우회 보기",
      artwork: { label: "BYPASS", icon: "🌧️", start: "#7C2D29", end: "#CB6E4C", accent: "#FFE2C1", detail: "#FFF8F1" },
    },
    mutations: [
      {
        index: 1,
        title: "해변 대신 숲 산책 코스",
        excerpt: "추천 카드 일부와 문구만 바뀌어도 화면이 크게 달라 보이는 예시입니다.",
        badge: "변경",
        meta: "방금 전 · 숲길",
        tone: "teal",
        cta: "코스 보기",
        artwork: { label: "FOREST", icon: "🌲", start: "#205D45", end: "#77B477", accent: "#E4F5DB", detail: "#F9FFF6" },
      },
      {
        index: 4,
        title: "노을 산책 포인트 조정",
        excerpt: "대표 썸네일과 배지가 함께 바뀌는 카드입니다.",
        badge: "업데이트",
        meta: "1분 전 · 전망대",
        tone: "purple",
        cta: "전망 보기",
        artwork: { label: "SUNSET", icon: "🌅", start: "#5E3777", end: "#C2839C", accent: "#FADDE6", detail: "#FFF7FA" },
      },
      {
        index: 7,
        title: "비 예보 반영 카페 루트",
        excerpt: "일부 카드만 새로 들어오고 나머지는 유지된다는 점을 보여줍니다.",
        badge: "우회",
        meta: "2분 전 · 실내",
        tone: "gold",
        cta: "카페 보기",
        artwork: { label: "CAFE", icon: "☕", start: "#6C4417", end: "#D8A258", accent: "#FFF1D5", detail: "#FFFBF3" },
      },
      {
        index: 10,
        title: "실내 전시관 루트 추가",
        excerpt: "새 추천 문구와 액션 버튼까지 함께 바뀌는 카드입니다.",
        badge: "대체",
        meta: "3분 전 · 전시관",
        tone: "crimson",
        cta: "실내 보기",
        artwork: { label: "MUSEUM", icon: "🖼️", start: "#7A2433", end: "#D16363", accent: "#FFE1E6", detail: "#FFF9FA" },
      },
    ],
    cardSeeds: [
      { slug: "coast", title: "해변 산책 코스", excerpt: "빛이 좋은 시간대와 산책 동선을 묶은 카드입니다.", badge: "추천", meta: "14분 전", tone: "teal", cta: "지도 보기", label: "COAST", icon: "🌊", start: "#1C6A7A", end: "#68C2C4", accent: "#D9F2F4", detail: "#F8FFFF" },
      { slug: "market", title: "시장 골목 루트", excerpt: "먹거리와 포토 스팟을 같이 엮은 추천 카드입니다.", badge: "도심", meta: "12분 전", tone: "gold", cta: "포인트 보기", label: "MARKET", icon: "🧺", start: "#7C4A16", end: "#D3A44B", accent: "#FFF0C6", detail: "#FFF9EF" },
      { slug: "hill", title: "언덕 전망 코스", excerpt: "짧은 루트지만 시각적으로 큰 배너를 쓰는 카드입니다.", badge: "전망", meta: "10분 전", tone: "purple", cta: "언덕 보기", label: "HILL", icon: "⛰️", start: "#433173", end: "#8A79CA", accent: "#E8E3FF", detail: "#FBF9FF" },
      { slug: "night", title: "야간 산책 포인트", excerpt: "야간 조명과 분위기 카드가 일부만 바뀌는 비교에 적합합니다.", badge: "야간", meta: "9분 전", tone: "slate", cta: "야경 보기", label: "NIGHT", icon: "🌙", start: "#293C58", end: "#6E88A8", accent: "#E0EAF7", detail: "#F6FAFF" },
      { slug: "forest", title: "숲길 피크닉 루트", excerpt: "같은 구조 안에서 색과 문구만 바뀌는 사례를 만듭니다.", badge: "휴식", meta: "8분 전", tone: "teal", cta: "피크닉 보기", label: "FOREST", icon: "🌿", start: "#205A43", end: "#7FBC80", accent: "#DEF5DE", detail: "#F9FFF8" },
      { slug: "gallery", title: "소형 전시관 루트", excerpt: "실내 전환이 필요한 경우 일부 카드만 달라지는 장면입니다.", badge: "실내", meta: "7분 전", tone: "slate", cta: "전시 보기", label: "GALLERY", icon: "🏛️", start: "#374758", end: "#8A9AA9", accent: "#E8EEF3", detail: "#FBFCFD" },
    ],
  },
  {
    id: "case-wall",
    name: "수사 파일 월",
    icon: "🧩",
    description: "증거 사진과 용의자 카드 일부만 바뀌는 수사 대시보드입니다.",
    focusBefore: "정리된 보드",
    focusAfter: "증거 카드 일부 추가",
    changeCountText: "배너 1 + 카드 5",
    railLead: "초기 상태: 고정된 사건 보드",
    railMiddle: "변경 포인트: 용의자/증거 카드 일부",
    railTail: "결과: DOM은 보드를 다시 그림",
    railTailModified: "결과: VDOM은 바뀐 카드만 교체",
    eyebrow: "CASE WALL",
    title: "야간 보관실 분실 사건",
    summary: "증거 사진과 카드가 섞인 대시보드는 일부만 바뀌어도 시각 차이가 크게 드러납니다.",
    badge: "증거 검토",
    action: "보드 잠금",
    tone: "slate",
    artwork: { label: "EVIDENCE", icon: "🧩", start: "#2D3945", end: "#7C8A97", accent: "#EBDCC1", detail: "#F8F5EF" },
    modifiedEyebrow: "SUSPECT UPDATE",
    modifiedTitle: "새 용의자 흔적 추가 포착",
    modifiedSummary: "새 카드가 한 장 추가되고 기존 카드 몇 장의 사진, 상태, 문구가 바뀌는 비교입니다.",
    modifiedBadge: "추적 확대",
    modifiedAction: "추적 전환",
    modifiedTone: "crimson",
    modifiedArtwork: { label: "TRACE", icon: "🕵️", start: "#522129", end: "#C06067", accent: "#F5DECC", detail: "#FFF8F2" },
    insertAt: 4,
    insertedCard: {
      title: "새 증거 봉투 추가",
      excerpt: "중간에 증거 카드가 한 장 더 들어오는 변화는 VDOM의 부분 삽입 설명에 적합합니다.",
      badge: "신규",
      meta: "방금 전 · 증거실",
      tone: "gold",
      cta: "봉투 열기",
      artwork: { label: "NEW BAG", icon: "📁", start: "#7A4F18", end: "#D69A40", accent: "#FFF1D0", detail: "#FFF9F1" },
    },
    mutations: [
      {
        index: 1,
        title: "잠금장치 지문 카드 갱신",
        excerpt: "기존 카드 제목과 사진만 교체되어도 변경 범위가 좁다는 점을 보여줍니다.",
        badge: "갱신",
        meta: "방금 전 · 출입구",
        tone: "teal",
        cta: "지문 보기",
        artwork: { label: "PRINT", icon: "🖐️", start: "#155D63", end: "#3CB0A6", accent: "#E0F7F3", detail: "#F8FFFD" },
      },
      {
        index: 4,
        title: "북측 CCTV 정밀 확대",
        excerpt: "문구와 썸네일이 같이 바뀌지만 전체 보드는 그대로인 상황입니다.",
        badge: "확대",
        meta: "1분 전 · CCTV",
        tone: "purple",
        cta: "확대 보기",
        artwork: { label: "ZOOM", icon: "🔍", start: "#402D6E", end: "#8A74C6", accent: "#EEE8FF", detail: "#FBF8FF" },
      },
      {
        index: 7,
        title: "회중시계 파편 재분류",
        excerpt: "증거 카드 색상과 상태만 바뀌는 변화도 부분 패치로 설명할 수 있습니다.",
        badge: "재분류",
        meta: "2분 전 · 감식",
        tone: "gold",
        cta: "감식 보기",
        artwork: { label: "CLOCK", icon: "⏱️", start: "#724619", end: "#D79A44", accent: "#FFF0C7", detail: "#FFF8EB" },
      },
      {
        index: 10,
        title: "용의자 동선 보드 연결",
        excerpt: "보드의 일부 카드만 연결 상태로 바뀌는 장면을 시각적으로 보여줍니다.",
        badge: "연결",
        meta: "3분 전 · 동선",
        tone: "crimson",
        cta: "동선 보기",
        artwork: { label: "TRACE", icon: "🧵", start: "#752532", end: "#D36872", accent: "#FFE2E6", detail: "#FFF8FA" },
      },
    ],
    cardSeeds: [
      { slug: "locker", title: "보관실 잠금장치", excerpt: "잠금장치 카드의 사진과 상태가 바뀌는 상황을 만듭니다.", badge: "잠금", meta: "12분 전", tone: "slate", cta: "잠금 보기", label: "LOCKER", icon: "🗝️", start: "#2E3F4B", end: "#768995", accent: "#E4DDD1", detail: "#FAF8F3" },
      { slug: "glove", title: "장갑 섬유 분석", excerpt: "텍스트와 사진이 함께 바뀌는 증거 카드입니다.", badge: "섬유", meta: "11분 전", tone: "teal", cta: "분석 보기", label: "FIBER", icon: "🧤", start: "#135D64", end: "#4AA9A8", accent: "#DDF7F4", detail: "#F8FFFE" },
      { slug: "hallway", title: "복도 CCTV 컷", excerpt: "대표 이미지가 있는 카드 몇 개만 바뀌는 장면을 제공합니다.", badge: "영상", meta: "10분 전", tone: "purple", cta: "영상 보기", label: "HALL", icon: "🎞️", start: "#402E72", end: "#8A75C5", accent: "#ECE7FF", detail: "#FBF9FF" },
      { slug: "clock", title: "회중시계 파편", excerpt: "감식팀 기록과 상태 배지가 카드 단위로 움직입니다.", badge: "감식", meta: "9분 전", tone: "gold", cta: "파편 보기", label: "CLOCK", icon: "⌚", start: "#72471A", end: "#D8A24A", accent: "#FFF0CB", detail: "#FFF9EF" },
      { slug: "route", title: "용의자 동선 기록", excerpt: "일부 카드만 연결되는 변화가 설명하기 좋습니다.", badge: "동선", meta: "8분 전", tone: "crimson", cta: "동선 열람", label: "ROUTE", icon: "📍", start: "#742432", end: "#D66B6E", accent: "#FFE3E7", detail: "#FFF9FA" },
      { slug: "bag", title: "증거 봉투 분류", excerpt: "새 카드 삽입과 카드 갱신을 동시에 보여줍니다.", badge: "봉투", meta: "7분 전", tone: "slate", cta: "봉투 보기", label: "BAG", icon: "📦", start: "#344352", end: "#7E8D99", accent: "#E6E0D5", detail: "#FCFBF7" },
    ],
  },
];

const sceneScenarios = sceneDefinitions.map((scene) => ({
  id: scene.id,
  name: scene.name,
  icon: scene.icon,
  description: scene.description,
  focusBefore: scene.focusBefore,
  focusAfter: scene.focusAfter,
  changeCountText: scene.changeCountText,
  generateInitial: (options) => buildSceneVdom(scene, getDensity(options?.density), null),
  generateModified: (options) => {
    const density = getDensity(options?.density);
    const packet = (scene.updatePackets ?? buildDefaultUpdatePackets(scene))[0];
    return buildSceneVdom(scene, density, packet);
  },
  prepare: (options) => prepareScenarioRun(scene, getDensity(options?.density)),
}));

// ── 기존 성능 측정 시나리오 (어댑터) ──────────────────────────────

function makeLi(text, key) {
  const props = key != null ? { key: String(key) } : {};
  return {
    type: "li",
    props,
    children: [{ type: "#text", text }],
  };
}

function bulkUpdateInitial(count = 1000) {
  const children = [];
  for (let i = 0; i < count; i++) {
    children.push(makeLi(`Item ${i}`, i));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

function bulkUpdateModified(count = 1000, changeRatio = 0.1) {
  const children = [];
  const changeEvery = Math.max(1, Math.floor(1 / changeRatio));
  for (let i = 0; i < count; i++) {
    const label = i % changeEvery === 0 ? `Updated-Item ${i} ✓` : `Item ${i}`;
    children.push(makeLi(label, i));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

function middleInsertInitial(count = 500) {
  const children = [];
  for (let i = 0; i < count; i++) {
    children.push(makeLi(`Row ${i}`, `row-${i}`));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

function middleInsertModified(count = 500, insertCount = 50) {
  const mid = Math.floor(count / 2);
  const children = [];
  for (let i = 0; i < mid; i++) {
    children.push(makeLi(`Row ${i}`, `row-${i}`));
  }
  for (let j = 0; j < insertCount; j++) {
    children.push(makeLi(`New-${j} ★`, `new-${j}`));
  }
  for (let i = mid; i < count; i++) {
    children.push(makeLi(`Row ${i}`, `row-${i}`));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

function buildDeepTree(depth, breadth, leafPrefix) {
  if (depth === 0) {
    return { type: "#text", text: `${leafPrefix}` };
  }
  const children = [];
  for (let i = 0; i < breadth; i++) {
    children.push({
      type: "div",
      props: { key: String(i), class: `depth-${depth}` },
      children: [buildDeepTree(depth - 1, breadth, `${leafPrefix}-${i}`)],
    });
  }
  return { type: "div", props: { class: `tree-level-${depth}` }, children };
}

function partialDeleteInitial(count = 1000) {
  const children = [];
  for (let i = 0; i < count; i++) {
    children.push(makeLi(`Row ${i}`, `row-${i}`));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

function partialDeleteModified(count = 1000, deleteRatio = 0.2) {
  const deleteCount = Math.floor(count * deleteRatio);
  const start = Math.floor((count - deleteCount) / 2);
  const children = [];
  for (let i = 0; i < count; i++) {
    if (i >= start && i < start + deleteCount) continue;
    children.push(makeLi(`Row ${i}`, `row-${i}`));
  }
  return { type: "ul", props: { class: "bench-list" }, children };
}

function countVdomNodes(vnode) {
  if (!vnode) return 0;
  if (vnode.type === "#text") return 1;
  return 1 + (vnode.children ?? []).reduce((sum, c) => sum + countVdomNodes(c), 0);
}

function makeClassicPacket(label, description, initialVdom, modifiedVdom) {
  return {
    label,
    description,
    receivedAt: new Date().toLocaleTimeString("ko-KR"),
    batchId: `CLASSIC-${String(Math.floor(Math.random() * 900) + 100)}`,
    changeCountText: `노드 ${countVdomNodes(modifiedVdom)}개`,
    focusAfter: "수치 측정",
  };
}

function wrapClassicScenario({ id, name, icon, description, params, buildInitial, buildModified }) {
  return {
    id,
    name,
    icon,
    description,
    hasCustomParams: true,
    params,
    prepare(options) {
      const paramValues = options?.customParams ?? {};
      const resolvedParams = {};
      for (const p of params) {
        resolvedParams[p.key] = paramValues[p.key] ?? p.default;
      }
      const initialVdom = buildInitial(resolvedParams);
      const modifiedVdom = buildModified(resolvedParams);
      const packet = makeClassicPacket(name, description, initialVdom, modifiedVdom);
      return { initialVdom, modifiedVdom, packet };
    },
  };
}

const classicScenarios = [
  wrapClassicScenario({
    id: "bulk-update",
    name: "대량 수정",
    icon: "📝",
    description: "리스트 중 일부만 텍스트 변경",
    params: [
      { key: "count", label: "항목 수", default: 3000, min: 100, max: 10000, step: 100 },
      { key: "changeRatio", label: "변경 비율(%)", default: 5, min: 1, max: 100, step: 1 },
    ],
    buildInitial: ({ count }) => bulkUpdateInitial(count),
    buildModified: ({ count, changeRatio }) => bulkUpdateModified(count, changeRatio / 100),
  }),
  wrapClassicScenario({
    id: "middle-insert",
    name: "중간 삽입",
    icon: "➕",
    description: "리스트 중간에 항목 삽입",
    params: [
      { key: "count", label: "전체 항목 수", default: 1000, min: 100, max: 10000, step: 100 },
      { key: "insertCount", label: "삽입 항목 수", default: 100, min: 10, max: 2000, step: 10 },
    ],
    buildInitial: ({ count }) => middleInsertInitial(count),
    buildModified: ({ count, insertCount }) => middleInsertModified(count, Math.min(insertCount, count)),
  }),
  wrapClassicScenario({
    id: "partial-delete",
    name: "부분 삭제",
    icon: "🗑️",
    description: "리스트 중간 영역을 일괄 삭제",
    params: [
      { key: "count", label: "전체 항목 수", default: 1000, min: 100, max: 10000, step: 100 },
      { key: "deleteRatio", label: "삭제 비율(%)", default: 20, min: 1, max: 90, step: 1 },
    ],
    buildInitial: ({ count }) => partialDeleteInitial(count),
    buildModified: ({ count, deleteRatio }) => partialDeleteModified(count, deleteRatio / 100),
  }),
];

export const scenarios = [...sceneScenarios, ...classicScenarios];
