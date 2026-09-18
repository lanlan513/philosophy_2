// 四扇问题之门 —— 内容树与版本。
// 节点类型：gate(入口) / answer(回答) / hesitation(犹豫) / counter(反问) / exit(出口)。
// 分支规则（locked 条件、revoked 撤销）只在这里定义，由服务端逐次求值，前端不持有规则。

export const questionMeta = {
  human: {
    id: 'human',
    number: '01',
    title: '人是什么？',
    accent: '#c75b3d',
    description: '从灵魂、理性到处境，关于“我们是谁”的答案从未只有一个。',
  },
  knowledge: {
    id: 'knowledge',
    number: '02',
    title: '知识从哪里来？',
    accent: '#7d8663',
    description: '经验可靠吗？理性能够抵达真理吗？',
  },
  real: {
    id: 'real',
    number: '03',
    title: '什么是真实？',
    accent: '#bb9558',
    description: '在现象、理念与语言之间，世界以怎样的方式显现？',
  },
  life: {
    id: 'life',
    number: '04',
    title: '怎样生活？',
    accent: '#536f7a',
    description: '一个值得过的人生，需要什么样的实践与勇气？',
  },
};

// 每扇门独立的版本号。内容或规则变化时递增（见 admin 接口），
// 进行中的会话会收到 VERSION_CONFLICT 并由客户端重放恢复。
export const questionVersions = {
  human: 2,
  knowledge: 1,
  real: 1,
  life: 1,
};

export const trees = {
  human: {
    start: 'h-start',
    nodes: {
      'h-start': {
        id: 'h-start',
        type: 'gate',
        title: '人是什么？',
        text: '先别急着翻书。这个问题没有标准答案，只有一条条走通过又断掉的路。选一个最接近你此刻直觉的回答，看看它会把你带到哪里。',
        options: [
          { id: 'o-reason', label: '人首先是会思考的存在', next: 'h-reason' },
          { id: 'o-thrown', label: '人是被抛进世界的处境', next: 'h-thrown' },
          { id: 'o-body', label: '人首先是一具会饿会累的身体', next: 'h-body' },
          {
            id: 'o-skip',
            label: '直接告诉我结论',
            next: 'h-exit-ethics',
            requires: { visitedAny: ['h-reason', 'h-thrown', 'h-body'] },
            lockedReason: '结论只在认真走过至少一条回答之后出现',
          },
        ],
      },
      'h-reason': {
        id: 'h-reason',
        type: 'answer',
        title: '人是有理性的动物',
        text: '从亚里士多德开始，这个回答统治了两千多年：把人和万物区分开的，是思考、权衡与说话的能力。其余的一切——情感、欲望、身体——都被排在了后面。',
        options: [
          { id: 'o-akrasia', label: '可我们常常明知故犯', next: 'h-akrasia' },
          { id: 'o-machine', label: '那会计算的机器算什么？', next: 'h-machine' },
        ],
      },
      'h-thrown': {
        id: 'h-thrown',
        type: 'answer',
        title: '人是被抛进世界的',
        text: '海德格尔说，你没有选择过自己的出生、时代与语言，却必须为这一切负责。萨特接着说：正因为没有预设的剧本，你的一举一动才都是在亲手定义“人”。',
        options: [
          { id: 'o-heavy', label: '自由听起来更像负担', next: 'h-weight' },
          { id: 'o-who', label: '是谁把我抛进来的？', next: 'h-who' },
        ],
      },
      'h-body': {
        id: 'h-body',
        type: 'answer',
        title: '人首先是一具身体',
        text: '会饿、会痛、会衰老。斯多葛学派提醒：先分清什么取决于你，什么不；而身体恰恰站在两者之间——你住在里面，却做不了它的主。',
        options: [
          { id: 'o-care', label: '那“照顾好自己”是什么意思', next: 'h-care' },
          { id: 'o-vessel', label: '所以身体只是容器吗', next: 'h-akrasia' },
        ],
      },
      'h-akrasia': {
        id: 'h-akrasia',
        type: 'hesitation',
        title: '先停一下：你真的听理性的吗？',
        text: '明知该睡了还在刷手机，明知不该说还是说了出口。如果理性是人的本质，为什么它输得这么频繁？也许“人是什么”，不能只看人最好的时刻。',
        options: [
          { id: 'o-passion', label: '也许情感才是主角', next: 'h-exit-ethics' },
          { id: 'o-back-reason', label: '再给理性一次机会', next: 'h-machine' },
        ],
      },
      'h-machine': {
        id: 'h-machine',
        type: 'counter',
        title: '如果机器通过了所有测试呢？',
        text: '一台机器能推理、会安慰人、说自己害怕被关掉——你会承认它是“人”吗？还是你会改口说：那些测试从来都不重要？你的第一反应，泄露了你对“人”的真实定义。',
        options: [
          { id: 'o-redefine', label: '那就重新定义“人”', next: 'h-exit-machine' },
          { id: 'o-feeling', label: '关键不在能力，在感受', next: 'h-exit-ethics' },
          {
            id: 'o-delegate',
            label: '让机器替我回答',
            next: 'h-exit-machine',
            revoked: true,
            revokedReason: '这条分支已被档案馆撤回：问题之门不替任何人作答',
          },
        ],
      },
      'h-weight': {
        id: 'h-weight',
        type: 'hesitation',
        title: '自由为什么让人眩晕',
        text: '克尔凯郭尔把这种感觉叫“眩晕”：不是怕掉下去，而是怕自己真的跳下去。如果一切都取决于你，那么逃避选择本身，也是一种选择。',
        options: [
          { id: 'o-escape', label: '那我能不能不选', next: 'h-who' },
          { id: 'o-accept', label: '接受这份重量', next: 'h-exit-exist' },
        ],
      },
      'h-who': {
        id: 'h-who',
        type: 'counter',
        title: '谁把我抛进来的？',
        text: '如果没有人抛你，“被抛”还成立吗？有神论者说那是上帝，存在主义者说那只是偶然。注意：你怎样回答这个问题，会反过来决定你怎样生活。',
        options: [
          { id: 'o-chance', label: '只是偶然，但偶然也够了', next: 'h-exit-exist' },
          { id: 'o-order', label: '也许背后有某种秩序', next: 'h-exit-ethics' },
        ],
      },
      'h-care': {
        id: 'h-care',
        type: 'counter',
        title: '“照顾好自己”是什么意思？',
        text: '如果“你”就是身体，照顾自己像保养一件工具；如果“你”不是身体，那又是谁在照顾谁？这个日常短语里，藏着一整个灵魂问题。',
        options: [
          { id: 'o-practice', label: '照顾是一种练习', next: 'h-exit-ethics' },
          { id: 'o-observer', label: '总有个“我”在背后看着', next: 'h-exit-machine' },
        ],
      },
      'h-exit-ethics': {
        id: 'h-exit-ethics',
        type: 'exit',
        title: '也许答案藏在“怎样生活”里',
        text: '你走到的这个位置，正是亚里士多德的起点：与其问人是什么，不如看人能成为什么。定义不是找到的，是活出来的。',
        links: [
          { to: '/philosopher/aristotle', label: '亚里士多德档案', kind: 'philosopher' },
          { to: '/explore/life', label: '进入「怎样生活」之门', kind: 'gate' },
        ],
      },
      'h-exit-exist': {
        id: 'h-exit-exist',
        type: 'exit',
        title: '人是自己选择的总和',
        text: '这条路的尽头没有定义，只有一个邀请：把“人是什么”换成“我要成为谁”。存在主义的房间就在隔壁。',
        links: [
          { to: '/philosopher/sartre', label: '萨特档案', kind: 'philosopher' },
          { to: '/philosopher/camus', label: '加缪档案', kind: 'philosopher' },
          { to: '/tradition/existentialism', label: '存在主义传统', kind: 'tradition' },
        ],
      },
      'h-exit-machine': {
        id: 'h-exit-machine',
        type: 'exit',
        title: '边界处最能看清“人”',
        text: '在机器、动物与神的夹缝之间，“人”的轮廓反而清晰起来。笛卡尔与康德都曾站在这个边界上，给出了完全不同的回答。',
        links: [
          { to: '/philosopher/descartes', label: '笛卡尔档案', kind: 'philosopher' },
          { to: '/philosopher/kant', label: '康德档案', kind: 'philosopher' },
        ],
      },
    },
  },

  knowledge: {
    start: 'k-start',
    nodes: {
      'k-start': {
        id: 'k-start',
        type: 'gate',
        title: '知识从哪里来？',
        text: '你此刻正在阅读的这些字，是怎么变成“知道”的？有人信任理性，有人信任经验，还有人怀疑这个问题本身。选一条路，走到它的尽头看看。',
        options: [
          { id: 'o-reason', label: '从理性来：像数学那样推导', next: 'k-reason' },
          { id: 'o-sense', label: '从经验来：所见所感即一切', next: 'k-sense' },
          { id: 'o-doubt', label: '我怀疑这个问题本身', next: 'k-doubt' },
        ],
      },
      'k-reason': {
        id: 'k-reason',
        type: 'answer',
        title: '理性派：从不容置疑处出发',
        text: '笛卡尔决定怀疑一切可以怀疑的东西，像拆掉一座危房那样拆掉自己的全部信念，只为找到一块不会再晃动的地基。',
        options: [
          { id: 'o-cogito', label: '他最后找到了什么？', next: 'k-cogito' },
          { id: 'o-crack1', label: '可数学家也会算错', next: 'k-crack' },
        ],
      },
      'k-sense': {
        id: 'k-sense',
        type: 'answer',
        title: '经验派：一切观念来自印象',
        text: '休谟说，把任何一个想法拆开，你最终都会摸到一些颜色、声音、痛感与情绪。心灵里没有一样东西，不是先经过感官的门。',
        options: [
          { id: 'o-cause', label: '那因果律也来自感官吗？', next: 'k-cause' },
          { id: 'o-crack2', label: '可感官常常骗我', next: 'k-crack' },
        ],
      },
      'k-doubt': {
        id: 'k-doubt',
        type: 'hesitation',
        title: '也许“从哪里来”问错了',
        text: '问知识的来源，就像问河流的起点：你找到的每一眼泉水，都还有自己的上游。也许更诚实的问题是：我们凭什么说自己“知道”？',
        options: [
          { id: 'o-try-reason', label: '那先试试理性这条路', next: 'k-reason' },
          { id: 'o-try-sense', label: '那先试试经验这条路', next: 'k-sense' },
          { id: 'o-synthesis', label: '有没有第三条路？', next: 'k-exit-kant' },
        ],
      },
      'k-cogito': {
        id: 'k-cogito',
        type: 'counter',
        title: '“我思故我在”真的是地基吗？',
        text: '怀疑到最后，笛卡尔剩下一句“我在思考，所以我存在”。可批评者问：这个“我”会不会只是语法开的玩笑？从“有思考发生”到“有一个我”，中间隔着一整座桥。',
        options: [
          { id: 'o-accept-cogito', label: '至少确定性从这里开始', next: 'k-exit-descartes' },
          { id: 'o-reject-cogito', label: '这座桥确实可疑', next: 'k-crack' },
        ],
      },
      'k-cause': {
        id: 'k-cause',
        type: 'counter',
        title: '太阳明天还会升起吗？',
        text: '当然会——可你的根据是什么？过去的每一次升起？休谟指出：那只是一再重复的习惯，不是逻辑上的保证。我们全部的科学，都建立在一个无法被证明的信念上。',
        options: [
          { id: 'o-science', label: '那科学还可靠吗', next: 'k-exit-hume' },
          { id: 'o-kant-answer', label: '康德怎样接住这个问题', next: 'k-exit-kant' },
        ],
      },
      'k-crack': {
        id: 'k-crack',
        type: 'hesitation',
        title: '两条路都有裂缝',
        text: '理性会算错，感官会骗人。也许问题不在于选哪条路，而在于承认：知识从来不是一次到位的抵达，而是不断校正的航行。',
        options: [
          { id: 'o-kant', label: '看康德如何缝合两者', next: 'k-exit-kant' },
          { id: 'o-hume', label: '跟休谟学会与怀疑共处', next: 'k-exit-hume' },
        ],
      },
      'k-exit-kant': {
        id: 'k-exit-kant',
        type: 'exit',
        title: '知识始于经验，成于理性',
        text: '康德的回答是：经验提供材料，理性提供形式，二者缺一就没有知识。这场和解划出了认识的边界，也划出了人的尊严。',
        links: [
          { to: '/philosopher/kant', label: '康德档案', kind: 'philosopher' },
          { to: '/tradition/german-idealism', label: '德国古典哲学', kind: 'tradition' },
        ],
      },
      'k-exit-hume': {
        id: 'k-exit-hume',
        type: 'exit',
        title: '与怀疑共处，也是一种知道',
        text: '休谟没有给知识找到地基，却给了它另一种东西：谦逊。知道我们知道得多么不牢靠，本身就是最难得的知识。',
        links: [
          { to: '/philosopher/hume', label: '休谟档案', kind: 'philosopher' },
          { to: '/tradition/modern', label: '近代哲学', kind: 'tradition' },
        ],
      },
      'k-exit-descartes': {
        id: 'k-exit-descartes',
        type: 'exit',
        title: '确定性是一种选择',
        text: '你可以接受笛卡尔的赌注：为了不动摇的知识，先让一切都摇晃一遍。普遍怀疑的方法，至今仍是思想最锋利的工具之一。',
        links: [
          { to: '/philosopher/descartes', label: '笛卡尔档案', kind: 'philosopher' },
          { to: '/tradition/modern', label: '近代哲学', kind: 'tradition' },
        ],
      },
    },
  },

  real: {
    start: 'r-start',
    nodes: {
      'r-start': {
        id: 'r-start',
        type: 'gate',
        title: '什么是真实？',
        text: '你摸到这张桌子，看到这块屏幕——这就是真实了吗？哲学家们在这个问题上分道扬镳了两千多年。选一个入口，注意你脚下的地面什么时候开始变软。',
        options: [
          { id: 'o-cave', label: '眼见为实，但眼睛够用吗', next: 'r-cave' },
          { id: 'o-mind', label: '真实或许由心灵参与构造', next: 'r-mind' },
          { id: 'o-forwhom', label: '先问：真实是对谁而言的', next: 'r-forwhom' },
        ],
      },
      'r-cave': {
        id: 'r-cave',
        type: 'answer',
        title: '洞穴：我们看见的都是影子',
        text: '柏拉图说，想象一群人从小被锁在洞穴里，只能看见墙上的影子。他们会把影子当成全部的真实——而我们，可能就在这个洞穴里。',
        options: [
          { id: 'o-forms', label: '走出洞穴的人看到了什么', next: 'r-forms' },
          { id: 'o-stay', label: '也许影子也有影子的真实', next: 'r-shadow' },
        ],
      },
      'r-mind': {
        id: 'r-mind',
        type: 'answer',
        title: '我们永远隔着一层玻璃看世界',
        text: '康德说，心灵不是被动的镜子：时间、空间、因果，都是心灵带给世界的框架。我们能认识的只是“现象”，物自体永远退在幕后。',
        options: [
          { id: 'o-phenom', label: '那科学描述的是什么？', next: 'r-phenom' },
          { id: 'o-sad', label: '这有点令人沮丧', next: 'r-shadow' },
        ],
      },
      'r-forwhom': {
        id: 'r-forwhom',
        type: 'hesitation',
        title: '真实是对谁而言的？',
        text: '对蝙蝠，真实是回声的形状；对蜜蜂，真实包括紫外线。你的“真实”里有多少只是人类的感官配置？这个问题没有贬低人，只是把人放回万物之中。',
        options: [
          { id: 'o-back-cave', label: '回到洞穴再想想', next: 'r-cave' },
          { id: 'o-sim', label: '那如果一切都是模拟呢', next: 'r-sim' },
        ],
      },
      'r-forms': {
        id: 'r-forms',
        type: 'counter',
        title: '如果真有完美的“圆”呢？',
        text: '你从没见过完美的圆，却知道什么样的圆不够圆。柏拉图问：这个判断的标准从哪里来？会不会有一个由纯粹形式构成的世界，而这里只是它的投影？',
        options: [
          { id: 'o-plato', label: '跟随柏拉图向上看', next: 'r-exit-plato' },
          { id: 'o-down', label: '我还是更信任这张桌子', next: 'r-shadow' },
        ],
      },
      'r-phenom': {
        id: 'r-phenom',
        type: 'counter',
        title: '科学描述的是世界，还是我们的世界？',
        text: '如果一切认识都经过心灵的框架，那么物理定律描述的是物自体，还是“对人而言必然如此”的世界？这个区分听起来吹毛求疵，却动摇了“客观”二字的根基。',
        options: [
          { id: 'o-kant', label: '去康德那里看完整的论证', next: 'r-exit-kant' },
          { id: 'o-heidegger', label: '换海德格尔的方式问', next: 'r-exit-heidegger' },
        ],
      },
      'r-shadow': {
        id: 'r-shadow',
        type: 'hesitation',
        title: '也许我们爱的就是影子',
        text: '就算知道了洞穴的真相，大多数人还是会回到座位上。影子温暖、熟悉、够用。追问真实需要的不只是智力，还有忍受不安的能力。',
        options: [
          { id: 'o-plato2', label: '还是想知道洞外有什么', next: 'r-exit-plato' },
          { id: 'o-heidegger2', label: '也许真实是一种显现方式', next: 'r-exit-heidegger' },
        ],
      },
      'r-sim': {
        id: 'r-sim',
        type: 'counter',
        title: '如果你是一场模拟呢？',
        text: '你的痛感、记忆、此刻的怀疑，都可能是一段代码的输出。可注意：就算这是真的，正在怀疑的“你”依然存在。笛卡尔早就用这个思路，从虚拟里捞出了确定。',
        options: [
          { id: 'o-cogito', label: '怀疑本身无法被模拟', next: 'r-exit-kant' },
          { id: 'o-care', label: '那又怎样，痛感是真的', next: 'r-exit-heidegger' },
        ],
      },
      'r-exit-plato': {
        id: 'r-exit-plato',
        type: 'exit',
        title: '真实在光的来处',
        text: '柏拉图的洞穴不是一个绝望的故事：锁链是可以挣脱的，只是眼睛需要时间适应光。哲学，就是那套适应光的训练。',
        links: [
          { to: '/philosopher/plato', label: '柏拉图档案', kind: 'philosopher' },
          { to: '/tradition/ancient-greece', label: '古希腊哲学', kind: 'tradition' },
        ],
      },
      'r-exit-kant': {
        id: 'r-exit-kant',
        type: 'exit',
        title: '界限之内，知识依然坚实',
        text: '承认认识的界限不是失败。康德说，正因为知道了边界在哪里，边界之内的知识才第一次变得牢靠。',
        links: [
          { to: '/philosopher/kant', label: '康德档案', kind: 'philosopher' },
          { to: '/explore/knowledge', label: '进入「知识从哪里来」之门', kind: 'gate' },
        ],
      },
      'r-exit-heidegger': {
        id: 'r-exit-heidegger',
        type: 'exit',
        title: '真实是显现，也是遮蔽',
        text: '海德格尔换了一种问法：真实不是摆在某处的物体，而是事物向我们展开的方式。每一次显现都伴随着遮蔽——这正是追问永远值得继续的原因。',
        links: [
          { to: '/philosopher/heidegger', label: '海德格尔档案', kind: 'philosopher' },
          { to: '/tradition/existentialism', label: '存在主义传统', kind: 'tradition' },
        ],
      },
    },
  },

  life: {
    start: 'l-start',
    nodes: {
      'l-start': {
        id: 'l-start',
        type: 'gate',
        title: '怎样生活？',
        text: '这是四扇门里最老的一扇，也是唯一一扇无法用别人的人生替你回答的。这里没有标准答案，只有几种被认真活过的可能。选一个，走到底。',
        options: [
          { id: 'o-happiness', label: '追求一种值得的幸福', next: 'l-happiness' },
          { id: 'o-absurd', label: '直面荒诞，仍然活下去', next: 'l-absurd' },
          { id: 'o-control', label: '先分清可控与不可控', next: 'l-control' },
        ],
      },
      'l-happiness': {
        id: 'l-happiness',
        type: 'answer',
        title: '幸福不是感觉，是一种活动',
        text: '亚里士多德说，幸福不是快乐的感觉，而是“灵魂合乎德性的现实活动”——像琴手弹琴那样，把人的能力出色地施展出来，并且坚持一生。',
        options: [
          { id: 'o-habit', label: '德性可以练习吗？', next: 'l-habit' },
          { id: 'o-luck', label: '可好人未必有好运', next: 'l-luck' },
        ],
      },
      'l-absurd': {
        id: 'l-absurd',
        type: 'answer',
        title: '世界不回答，你还要继续吗？',
        text: '加缪说，荒诞不在世界里，也不在人身上，而在“人追问意义、世界保持沉默”的相遇里。问题不是要不要活，而是怎样带着荒诞活下去。',
        options: [
          { id: 'o-revolt', label: '为什么不干脆放弃？', next: 'l-revolt' },
          { id: 'o-warm', label: '这也太冷了', next: 'l-warm' },
        ],
      },
      'l-control': {
        id: 'l-control',
        type: 'answer',
        title: '分清什么取决于你',
        text: '斯多葛学派的功课只有一句话：有些事取决于你，有些事不。痛苦大多来自把两者搞混——为不可控的事焦虑，又对可控的事撒手。',
        options: [
          { id: 'o-cold', label: '这难道不是冷漠吗？', next: 'l-cold' },
          { id: 'o-cant', label: '道理懂，可我做不到', next: 'l-luck' },
        ],
      },
      'l-habit': {
        id: 'l-habit',
        type: 'counter',
        title: '德性像练琴，不像背书',
        text: '没有人靠读乐谱学会弹琴。亚里士多德说，我们是因为做了公正的事才成为公正的人。那么问题是：你今天重复的那些小事，正在把你练成什么样的人？',
        options: [
          { id: 'o-practice', label: '从明天的一件小事开始', next: 'l-exit-aristotle' },
          { id: 'o-examine', label: '先审视我正在重复什么', next: 'l-exit-aristotle' },
        ],
      },
      'l-luck': {
        id: 'l-luck',
        type: 'hesitation',
        title: '运气在人生里占多大比重？',
        text: '疾病、时代、出身——太多东西不在你手里。承认这一点不是认输：恰恰是看清运气的边界之后，你才知道该把力气花在哪里。',
        options: [
          { id: 'o-virtue', label: '把赌注下在品格上', next: 'l-exit-aristotle' },
          { id: 'o-inner', label: '守住内在的城堡', next: 'l-exit-stoic' },
        ],
      },
      'l-revolt': {
        id: 'l-revolt',
        type: 'counter',
        title: '放弃，等于承认荒诞赢了',
        text: '加缪拒绝两条捷径：肉体的自杀，与哲学的自杀（躲进一个编造的意义里）。剩下的路只有一条：清醒地活着，并且反抗。西西弗是幸福的——因为石头是他的。',
        options: [
          { id: 'o-rebel', label: '想象幸福的西西弗', next: 'l-exit-camus' },
          { id: 'o-others', label: '反抗是一个人的事吗', next: 'l-exit-camus' },
        ],
      },
      'l-warm': {
        id: 'l-warm',
        type: 'hesitation',
        title: '荒诞里有没有温柔？',
        text: '有的。加缪写地中海的阳光、足球、夏天与友谊。正因为没有来世的补偿，此刻的体温才值得被认真感受。荒诞不是取消生活，而是给生活加了浓度。',
        options: [
          { id: 'o-summer', label: '去感受此刻的温度', next: 'l-exit-camus' },
          { id: 'o-together', label: '温柔需要别人在场', next: 'l-exit-sartre' },
        ],
      },
      'l-cold': {
        id: 'l-cold',
        type: 'counter',
        title: '斯多葛是冷漠吗？',
        text: '斯多葛哲人也爱人、也尽责、也为城邦奔走。他们只是拒绝把幸福抵押给不可控的结果。这不是冷漠，是把爱从占有里解放出来。',
        options: [
          { id: 'o-zeno', label: '去看看芝诺怎么活', next: 'l-exit-stoic' },
          { id: 'o-choose', label: '我还是想自己选方向', next: 'l-exit-sartre' },
        ],
      },
      'l-exit-aristotle': {
        id: 'l-exit-aristotle',
        type: 'exit',
        title: '把人生过成一种练习',
        text: '德性不是天赋，是习惯的总和。你重复什么，就成为什么——这既是警告，也是希望。',
        links: [
          { to: '/philosopher/aristotle', label: '亚里士多德档案', kind: 'philosopher' },
          { to: '/tradition/ancient-greece', label: '古希腊哲学', kind: 'tradition' },
        ],
      },
      'l-exit-stoic': {
        id: 'l-exit-stoic',
        type: 'exit',
        title: '在变化中守住判断',
        text: '斯多葛的城墙不在城外，在心里。每天清晨预想失去，每天夜晚清点言行——这套古老的练习，今天依然有效。',
        links: [
          { to: '/philosopher/zeno', label: '芝诺档案', kind: 'philosopher' },
          { to: '/tradition/ancient-greece', label: '古希腊哲学', kind: 'tradition' },
        ],
      },
      'l-exit-camus': {
        id: 'l-exit-camus',
        type: 'exit',
        title: '清醒、反抗、共同生活',
        text: '加缪的答案不在书里，在“尽管如此”四个字里：尽管如此，仍然去爱，仍然去创造，仍然站在阳光下。',
        links: [
          { to: '/philosopher/camus', label: '加缪档案', kind: 'philosopher' },
          { to: '/tradition/existentialism', label: '存在主义传统', kind: 'tradition' },
        ],
      },
      'l-exit-sartre': {
        id: 'l-exit-sartre',
        type: 'exit',
        title: '你是自己选择的总和',
        text: '没有剧本，意味着每一步都算数。萨特说，选择自己的同时，你也在为所有人选择“人”的样子。',
        links: [
          { to: '/philosopher/sartre', label: '萨特档案', kind: 'philosopher' },
          { to: '/explore/human', label: '进入「人是什么」之门', kind: 'gate' },
        ],
      },
    },
  },
};
