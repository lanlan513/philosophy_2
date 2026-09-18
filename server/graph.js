// 问题之门的唯一事实来源（source of truth）。
// 前端只拿到“当前节点 + 可见选项”，分支规则、条件跳转、版本裁剪都在服务端完成。
//
// 节点类型 type：
//   root      一扇门的入口，本身也是一次“反问”
//   answer    一条回答
//   hesitation 一次犹豫（不直接给答案，先检查问题本身）
//   counter   一次反问（把上一条回答推到边缘）
//   terminal  路径终点：带着问题离开
//
// options.target 可以是节点 id 字符串，也可以是 { rule: 'RULE_ID' }，
// 后者由 engine 根据已走路径在服务端解析，前端无从猜测。

export const DOORS = [
  { id: 'human', number: '01', title: '人是什么？', description: '从灵魂、理性到处境，关于“我们是谁”的答案从未只有一个。', accent: '#c75b3d' },
  { id: 'knowledge', number: '02', title: '知识从哪里来？', description: '经验可靠吗？理性能够抵达真理吗？', accent: '#7d8663' },
  { id: 'real', number: '03', title: '什么是真实？', description: '在现象、理念与语言之间，世界以怎样的方式显现？', accent: '#bb9558' },
  { id: 'life', number: '04', title: '怎样生活？', description: '一个值得过的人生，需要什么样的实践与勇气？', accent: '#536f7a' },
];

// 历史条件分支规则：同一个选项，因走过的路不同，落向不同节点。
export const RULES = {
  // “现象本身算真实吗？”——你从哪条路来，就落在哪一种现象学里。
  REAL_PHENOMENA: {
    id: 'REAL_PHENOMENA',
    resolve(history) {
      const path = history.map((entry) => entry.nodeId);
      if (path.includes('real_language')) return 'real_phenomena_language';
      if (path.includes('real_reason')) return 'real_phenomena_reason';
      return 'real_phenomena_senses';
    },
  },
};

const NODES = [
  // ───────────────────────────── 门 01：人是什么 ─────────────────────────────
  {
    id: 'human_root', door: 'human', type: 'root',
    title: '人是什么？',
    kicker: '在回答之前',
    body: [
      '德尔斐神庙上刻着“认识你自己”。可两千年后，我们仍然会在某个普通的时刻被这句话拦住：我以为的“我”，究竟是什么？',
      '先别急着挑一个正确答案。你如何开始回答，本身就已经是回答的一部分。',
    ],
    options: [
      { id: 'h_r_1', label: '我首先是一个能思考的灵魂', target: 'human_soul' },
      { id: 'h_r_2', label: '我是被处境塑造出来的人', target: 'human_context' },
      { id: 'h_r_3', label: '我还不确定，想先看看这个问题本身', target: 'human_question' },
    ],
  },
  {
    id: 'human_soul', door: 'human', type: 'answer', thinker: '柏拉图',
    title: '会使用身体的灵魂',
    body: [
      '在柏拉图那里，人首先是灵魂。身体会朽坏、会欺骗，而灵魂凭借理性回忆起它在理念世界曾见过的东西。',
      '他把灵魂分成三部分：理性、意气和欲望。正义的人，是让理性说服其余两部分、各安其位的人。你不是你的欲望，你是那个能够审视欲望的东西。',
    ],
    options: [
      { id: 'h_s_1', label: '那么身体、欲望和情绪算什么？', target: 'human_body_ask' },
      { id: 'h_s_2', label: '这个答案，今天还成立吗？', target: 'human_soul_doubt' },
    ],
  },
  {
    id: 'human_body_ask', door: 'human', type: 'counter', thinker: '亚里士多德',
    title: '反问：灵魂能离开身体吗？',
    body: [
      '亚里士多德拒绝把人劈成两半。如果眼睛是身体，那么“看见”就是它的灵魂——灵魂不是被关进身体的囚徒，而是让一个活的身体成其自身的那种东西。',
      '于是问题换了：不是“我的灵魂如何摆脱身体”，而是“我这个身心整体，如何活动得好”。',
    ],
    options: [
      { id: 'h_b_1', label: '所以，人是靠习惯成为自己的？', target: 'human_habit' },
      { id: 'h_b_2', label: '那理性还剩下什么特权？', target: 'human_reason_privilege' },
    ],
  },
  {
    id: 'human_habit', door: 'human', type: 'answer', thinker: '亚里士多德',
    title: '我们是反复实践的东西',
    body: [
      '德性不是天生的，也不是听来的。我们通过建造房屋成为营造者，通过做公正的事成为公正的人。',
      '换句话说，你不是先有一个“本质”再去生活；你在一次次具体的选择里，把自己造成了后来的样子。',
    ],
    options: [
      { id: 'h_h_1', label: '这听起来像：人就是习惯的总和', target: 'human_terminal_synthesis' },
      { id: 'h_h_2', label: '可如果我想改变呢？习惯不是命运吗？', target: 'human_change' },
    ],
  },
  {
    id: 'human_change', door: 'human', type: 'counter', thinker: '萨特',
    title: '反问：习惯能替你做决定吗？',
    body: [
      '萨特不接受“我就是这样的人”。你可以说自己懦弱、性急、出身如此——但每一次，你仍然可以决定下一次要不要继续如此。',
      '过去不能替未来签字。这或许是好消息，也或许是更重的东西。',
    ],
    options: [
      { id: 'h_c_1', label: '自由比我想象的更重', target: 'human_condemned' },
    ],
  },
  {
    id: 'human_condemned', door: 'human', type: 'answer', thinker: '萨特',
    title: '被判处自由',
    body: [
      '“人是被判处自由的。”没有一份写好的剧本等你去发现，没有上帝、没有本性、没有环境可以替你承担最后的责任。',
      '你做出的每个选择，都在回答另一个更安静的问题：你认为人应该是什么样子。',
    ],
    options: [
      { id: 'h_cd_1', label: '那么，人是必须不断选择自己的存在', target: 'human_terminal_synthesis' },
    ],
  },
  {
    id: 'human_reason_privilege', door: 'human', type: 'hesitation',
    title: '犹豫：理性是王座，还是工具？',
    body: [
      '近代人对这个分裂格外敏感。休谟说，理性永远是激情的奴隶——它只计算手段，从不设定目的；康德则反过来，要让理性为整个经验世界立法。',
      '这一分歧在第二扇门里会再次出现。此刻，你愿意先带着身体与习惯的答案继续，还是转去看看处境中的人？',
    ],
    options: [
      { id: 'h_rp_1', label: '回到身体与习惯的答案', target: 'human_habit' },
      { id: 'h_rp_2', label: '去看看处境如何塑造我们', target: 'human_context' },
    ],
  },
  {
    id: 'human_soul_doubt', door: 'human', type: 'hesitation',
    title: '犹豫：不朽的灵魂，还找得到吗？',
    body: [
      '现代科学把思考还原为神经放电，把情绪还原为化学信号。“灵魂”更像一个古老的比喻，而不是一件可以指认的东西。',
      '但也许，失去一个答案不等于失去那个问题。',
    ],
    options: [
      { id: 'h_sd_1', label: '也许答案在“处境”那一边', target: 'human_context' },
      { id: 'h_sd_2', label: '接受这种不确定，带着它离开', target: 'human_terminal_question' },
    ],
  },
  {
    id: 'human_context', door: 'human', type: 'answer', thinker: '海德格尔',
    title: '被抛入世界的存在者',
    body: [
      '海德格尔把人称作“此在”：你从不是一个先包装好、再被放进世界的主体。你发现自己已经被抛入一段历史、一种语言、一堆来不及选择的关系之中。',
      '理解你自己，只能从你已经身处的那个世界开始。',
    ],
    options: [
      { id: 'h_ct_1', label: '被抛入哪里？语言和传统吗？', target: 'human_language' },
      { id: 'h_ct_2', label: '如果是被抛入自由之中呢？', target: 'human_condemned' },
      { id: 'h_ct_3', label: '这是不是说，人根本没有本性？', target: 'human_no_nature' },
    ],
  },
  {
    id: 'human_language', door: 'human', type: 'answer', thinker: '海德格尔',
    title: '语言是存在之家',
    body: [
      '你不是先有完整的思想，再去找词；更接近真相的说法是：你能在一种语言里理解到什么，你就成为什么样的人。',
      '那么改变说话的方式，就不只是修辞，而是在改变我们理解自身的方式。',
    ],
    options: [
      { id: 'h_lg_1', label: '这意味着改变始终可能', target: 'human_change' },
    ],
  },
  {
    id: 'human_no_nature', door: 'human', type: 'answer', thinker: '萨特',
    title: '存在先于本质',
    body: [
      '裁剪刀先有图纸再有成品——那是“本质先于存在”。萨特说人恰恰相反：你先存在、先行动，然后你的“本质”才被一笔一画写出来。',
      '没有任何关于“人本来是什么”的定义，可以豁免你的选择。',
    ],
    options: [
      { id: 'h_nn_1', label: '去看看这份自由的重量', target: 'human_condemned' },
    ],
  },
  {
    id: 'human_question', door: 'human', type: 'hesitation', thinker: '苏格拉底',
    title: '犹豫本身，也是一种回答',
    body: [
      '苏格拉底从不直接灌下答案。他在街头拦住自信的人，接连发问，直到对方发现：自己甚至说不清“正义”是什么。',
      '这种不知所措不是失败。承认无知，是思考真正开始的位置。',
    ],
    options: [
      { id: 'h_q_1', label: '那就从“灵魂”的答案开始', target: 'human_soul' },
      { id: 'h_q_2', label: '从“处境”的答案开始', target: 'human_context' },
      { id: 'h_q_3', label: '我想先理解这种提问的方式', target: 'human_method' },
    ],
  },
  {
    id: 'human_method', door: 'human', type: 'counter', thinker: '苏格拉底',
    title: '反问：谁有权替你回答？',
    body: [
      '助产术接生出的是对话者自己的想法——苏格拉底说他只是助产婆。答案如果不是你在追问中亲自抵达的，它就不会真的属于你。',
      '所以这条路径不提供终点结论，它只训练一种动作：在每个脱口而出的答案前，再停一秒。',
    ],
    options: [
      { id: 'h_m_1', label: '带着这种方法离开', target: 'human_terminal_method' },
    ],
  },
  {
    id: 'human_terminal_synthesis', door: 'human', type: 'terminal',
    title: '终点：一个向自己提问的存在',
    kicker: '你的路径到此收束',
    body: [
      '你经过了灵魂与身体、习惯与自由。它们没有拼成一个单义的定义，却划出了同一个轮廓：人不是现成之物，而是唯一一个会对自身存在发问的存在者。',
      '“我是什么”不等待一个名词，它要求一种生活。',
    ],
    relatedThinkers: ['亚里士多德', '萨特', '海德格尔'],
    relatedDoors: ['knowledge'],
  },
  {
    id: 'human_terminal_question', door: 'human', type: 'terminal',
    title: '终点：悬而未决的人',
    kicker: '你的路径到此收束',
    body: [
      '你拒绝用一个仓促的答案封门。这或许正是这个问题最诚实的形态：人是一种尚未完成的东西，连定义也要由自己的生活来续写。',
      '保持这个问号，它比多数答案都耐用。',
    ],
    relatedThinkers: ['休谟', '康德'],
    relatedDoors: ['knowledge'],
  },
  {
    id: 'human_terminal_method', door: 'human', type: 'terminal',
    title: '终点：审视的生活',
    kicker: '你的路径到此收束',
    body: [
      '苏格拉底说，未经审视的人生不值得过。你带走的不是一条教义，而是一个可以反复使用的姿势：追问、停顿、辨认自己的无知。',
      '下一扇门里，这个姿势将对准“知识”本身。',
    ],
    relatedThinkers: ['苏格拉底'],
    relatedDoors: ['knowledge'],
  },

  // ─────────────────────────── 门 02：知识从哪里来 ───────────────────────────
  {
    id: 'knowledge_root', door: 'knowledge', type: 'root',
    title: '知识从哪里来？',
    kicker: '在回答之前',
    body: [
      '你声称自己知道很多事：水在沸腾，两点之间直线最短，人应当诚实。可是“知道”这个词，凭什么用在这三种如此不同的东西上？',
      '近代哲学的大半战场，就铺在这个看似天真的问题下面。',
    ],
    options: [
      { id: 'k_r_1', label: '从感官经验中来', target: 'knowledge_exp' },
      { id: 'k_r_2', label: '从理性和数学式的推演中来', target: 'knowledge_reason' },
      { id: 'k_r_3', label: '等等——我们连“知道”是什么都没定义', target: 'knowledge_def' },
    ],
  },
  {
    id: 'knowledge_exp', door: 'knowledge', type: 'answer', thinker: '休谟',
    title: '一切观念都来自印象',
    body: [
      '休谟把心灵的内容分成两类：鲜活的印象（灼痛、颜色、愤怒）和它们褪色后的摹本——观念。再抽象的概念，拆到最后也都来自经验。',
      '那么所谓知识，就是对这些材料的联想、比较与习惯推演。',
    ],
    options: [
      { id: 'k_e_1', label: '可是“因果”真的存在于世界中吗？', target: 'knowledge_cause' },
      { id: 'k_e_2', label: '那科学还剩下什么？', target: 'knowledge_science' },
    ],
  },
  {
    id: 'knowledge_cause', door: 'knowledge', type: 'counter', thinker: '休谟',
    title: '反问：你看见“必然”了吗？',
    body: [
      '你一次又一次看见火之后跟着热，但你看见的从来只是“先后”，不是“必然导致”。让你确信下一次仍会如此的，不是理性，而是习惯。',
      '因果不是世界盖给我们看的印章，而是心灵阅读世界时形成的姿势。',
    ],
    options: [
      { id: 'k_c_1', label: '这会滑向彻底的怀疑论吗？', target: 'knowledge_doubt' },
      { id: 'k_c_2', label: '也许因果是理性加给世界的？', target: 'knowledge_structures' },
    ],
  },
  {
    id: 'knowledge_science', door: 'knowledge', type: 'answer',
    title: '科学不需要“必然性”',
    body: [
      '有趣的是，科学并没有因此倒塌。它本就不承诺逻辑必然，只提供不断被检验、也随时可能被修正的最佳解释。',
      '可一旦承认这一点，知识与“迄今为止没出错的信念”之间的界限，就变得需要重新辨认。',
    ],
    options: [
      { id: 'k_sc_1', label: '在不确定中如何生活？', target: 'knowledge_doubt' },
      { id: 'k_sc_2', label: '一定有什么结构让经验成为可能', target: 'knowledge_structures' },
    ],
  },
  {
    id: 'knowledge_reason', door: 'knowledge', type: 'answer', thinker: '笛卡尔',
    title: '我思，故我在',
    body: [
      '笛卡尔决定怀疑一切可以怀疑的东西：感官会骗人，梦境与清醒难以区分，甚至数学也可能是恶魔的恶作剧。',
      '但怀疑本身无法被怀疑——正在怀疑的那个“我”，必然存在。这是风暴中心唯一不动的点。',
    ],
    options: [
      { id: 'k_rs_1', label: '从“我思”如何推出外部世界？', target: 'knowledge_world' },
      { id: 'k_rs_2', label: '单凭理性，到底能走多远？', target: 'knowledge_reason_limit' },
    ],
  },
  {
    id: 'knowledge_world', door: 'knowledge', type: 'counter',
    title: '反问：主体之外，还有世界吗？',
    body: [
      '这一步出了名地难走。笛卡尔最终借助对上帝之善的担保，才敢重新相信外部世界——许多读者认为，最坚固的房子到这里突然换上了纸墙。',
      '也许需要的不是从主体内部跳出去，而是重新理解主体与世界的关系。',
    ],
    options: [
      { id: 'k_w_1', label: '这条路太险，去看看康德', target: 'knowledge_structures' },
      { id: 'k_w_2', label: '也许我们该更信任经验', target: 'knowledge_exp' },
    ],
  },
  {
    id: 'knowledge_reason_limit', door: 'knowledge', type: 'hesitation',
    title: '犹豫：理性能不能证明理性？',
    body: [
      '理性无法靠自己证明自己的可靠——任何证明都已经在使用理性。这不是可以修补的漏洞，而是一切论证的起点处境。',
      '康德后来承认这个限制，却在限制之内找到了另一番确定性。',
    ],
    options: [
      { id: 'k_rl_1', label: '去看看理性在边界内能做什么', target: 'knowledge_structures' },
    ],
  },
  {
    id: 'knowledge_structures', door: 'knowledge', type: 'answer', thinker: '康德',
    title: '一场哥白尼式的革命',
    body: [
      '康德说，认识不是认识符合对象，而是对象符合我们的认识形式。时间、空间、因果这些不是从事物里抽出来的——它们是心灵让经验得以显现的框架。',
      '理性与经验的战争因此停火：没有概念的经验是盲的，没有经验的概念是空的。',
    ],
    options: [
      { id: 'k_st_1', label: '那么框架之外的“物自身”呢？', target: 'knowledge_thing' },
      { id: 'k_st_2', label: '这已经是一条可以接受的答案', target: 'knowledge_terminal_copernicus' },
    ],
  },
  {
    id: 'knowledge_thing', door: 'knowledge', type: 'counter', thinker: '康德',
    title: '反问：我们能认识界限的另一边吗？',
    body: [
      '必须有东西刺激感官，但那东西“本身”是什么，我们永远无法知道——摘下有色眼镜的动作，仍要借助那副眼镜完成。',
      '康德认为，老形而上学的失败，正是理性不断越界、硬要言说不可言说之物留下的病历。',
    ],
    options: [
      { id: 'k_t_1', label: '那就守住这条边界', target: 'knowledge_terminal_limit' },
      { id: 'k_t_2', label: '“显现”与“真实”的关系——去第三扇门', target: 'knowledge_terminal_real' },
    ],
  },
  {
    id: 'knowledge_doubt', door: 'knowledge', type: 'hesitation',
    title: '犹豫：怀疑之后还剩下什么？',
    body: [
      '彻底的怀疑论奇怪地无法被驳倒，也奇怪地无法被践行——没有人能带着“因果也许明天失效”的结论停止吃饭、取暖和过马路。',
      '怀疑或许不是终点，而是一剂泻药：它排空独断，然后连自己也一起排掉。',
    ],
    options: [
      { id: 'k_d_1', label: '学会与确定性的缺席共处', target: 'knowledge_terminal_doubt' },
      { id: 'k_d_2', label: '但康德似乎找到了出路', target: 'knowledge_structures' },
    ],
  },
  {
    id: 'knowledge_def', door: 'knowledge', type: 'hesitation',
    title: '犹豫：什么才算“知道”？',
    body: [
      '经典的定义是：得到辩护的真信念。可二十世纪的思想者构造出一些情形——你有信念、它为真、你也有理由——我们却仍不想称之为知识。',
      '在定义松动的地方进入战场，也许比急着站队看得更清楚。',
    ],
    options: [
      { id: 'k_df_1', label: '还是先从经验派内部看看', target: 'knowledge_exp' },
      { id: 'k_df_2', label: '先看理性派的堡垒', target: 'knowledge_reason' },
      { id: 'k_df_3', label: '定义的问题，最终连着“真实”', target: 'knowledge_terminal_real' },
    ],
  },
  {
    id: 'knowledge_terminal_copernicus', door: 'knowledge', type: 'terminal',
    title: '终点：在中间地带安家',
    kicker: '你的路径到此收束',
    body: [
      '你没有得到一面完美映照世界的镜子，却得到了一个更诚实的图景：知识发生在经验材料与认识形式的交汇处。',
      '确定性没有被取消，它只是从“世界本身”搬回了“经验世界的结构”。',
    ],
    relatedThinkers: ['康德', '休谟'],
    relatedDoors: ['real'],
  },
  {
    id: 'knowledge_terminal_limit', door: 'knowledge', type: 'terminal',
    title: '终点：边界的守卫者',
    kicker: '你的路径到此收束',
    body: [
      '承认有些问题无法以知识的方式回答，不是怯懦，而是给信念、道德与信仰留出它们各自的地盘。',
      '知道认识的界限在哪里，本身就是一种罕见的知识。',
    ],
    relatedThinkers: ['康德'],
    relatedDoors: ['human'],
  },
  {
    id: 'knowledge_terminal_doubt', door: 'knowledge', type: 'terminal',
    title: '终点：悬置的勇气',
    kicker: '你的路径到此收束',
    body: [
      '你带走的是一种训练过的谨慎：在证据不足处不伪造确定性，在习惯冒充理性处及时认出它。',
      '怀疑不提供安居，却能防止你住进危房。',
    ],
    relatedThinkers: ['休谟'],
    relatedDoors: ['life'],
  },
  {
    id: 'knowledge_terminal_real', door: 'knowledge', type: 'terminal',
    title: '过渡：知识的尽头，是真实的入口',
    kicker: '一扇门在你身后合上',
    body: [
      '当知识被界定为“向我们显现的世界”的知识，一个更老的问题立刻站起来：显现之外，还有真实吗？',
      '这正是第三扇门。',
    ],
    relatedThinkers: ['康德', '柏拉图'],
    relatedDoors: ['real'],
  },

  // ─────────────────────────── 门 03：什么是真实 ───────────────────────────
  {
    id: 'real_root', door: 'real', type: 'root',
    title: '什么是真实？',
    kicker: '在回答之前',
    body: [
      '你此刻醒着。可你也做过同样确信自己醒着的梦。如果连“这是梦吗”都无法当场排除，“真实”要在哪里生根？',
      '三种古老的冲动在这扇门后等着：信任感官、信任理性，或反过来审视“真实”这个词。',
    ],
    options: [
      { id: 'r_r_1', label: '感官所及，就是真实', target: 'real_senses' },
      { id: 'r_r_2', label: '感官骗人，真实属于数学与理念', target: 'real_reason' },
      { id: 'r_r_3', label: '也许“真实”这个词本身就有问题', target: 'real_language' },
    ],
  },
  {
    id: 'real_senses', door: 'real', type: 'answer', thinker: '亚里士多德',
    title: '真实就在事物之中',
    body: [
      '亚里士多德不愿在世界之外另设一个世界。形式不在彼岸，而就在这匹马、这尊雕像、这个城邦之中——知识从对个别事物的经验生长起来。',
      '信任感官，意味着接受变化、质料与日常世界的本体论资格。',
    ],
    options: [
      { id: 'r_s_1', label: '可是感官确实会骗人：水中折断的筷子', target: 'real_illusion' },
      { id: 'r_s_2', label: '那为什么建立在观察上的科学如此成功？', target: 'real_science' },
    ],
  },
  {
    id: 'real_illusion', door: 'real', type: 'counter', thinker: '笛卡尔',
    title: '反问：被骗过一次，还能全信吗？',
    body: [
      '塔远看是圆的，走近却是方的；黄疸病人看什么都黄；梦境可以以假乱真。笛卡尔追问：有没有一种“真实的保证”，是任何幻象都无法仿制的？',
      '这一问，把许多人推向了理性那一边。',
    ],
    options: [
      { id: 'r_i_1', label: '也许真实只能由理性保证', target: 'real_reason' },
      { id: 'r_i_2', label: '等等，现象本身难道不真实吗？', target: { rule: 'REAL_PHENOMENA' } },
    ],
  },
  {
    id: 'real_science', door: 'real', type: 'answer',
    title: '可操作性的真实',
    body: [
      '科学不回答“桌子本身是什么”，它给出有预测力的模型，并且一再应验。一种看法说：能被如此稳定地干预、测量与验证的东西，就配称作真实。',
      '但成功的理论史也写满了后来被抛弃的实体——燃素、以太——“有用”与“真实”之间仍有缝隙。',
    ],
    options: [
      { id: 'r_sc_1', label: '那么现象与实在的关系仍要追问', target: { rule: 'REAL_PHENOMENA' } },
    ],
  },
  {
    id: 'real_reason', door: 'real', type: 'answer', thinker: '柏拉图',
    title: '真实是理念的世界',
    body: [
      '洞穴里的人终生观看墙上的影子，把回声与投影当作全部真实。柏拉图说，我们的感官处境正是如此：个别的美的事物会朽坏，而“美本身”不生不灭。',
      '真正的真实是理念的世界，哲学就是转身、挣脱锁链、走向光亮的过程。',
    ],
    options: [
      { id: 'k_rs2_1', label: '理念世界“在哪里”？谁见过它？', target: 'real_forms' },
      { id: 'k_rs2_2', label: '这是不是让人逃离了唯一的生活？', target: 'real_caveback' },
    ],
  },
  {
    id: 'real_forms', door: 'real', type: 'counter',
    title: '反问：理念如何存在？',
    body: [
      '如果每一类事物都对应一个理念，那么“人”与“人的理念”之间，是否还需要第三个理念把它们统一？追问可以无限后退——这就是著名的“第三人论证”。',
      '也许真实并不在高处的另一世界，而在历史与意义的展开中。',
    ],
    options: [
      { id: 'r_f_1', label: '去看看把真实理解为历史过程的思想', target: 'real_history' },
      { id: 'r_f_2', label: '也许还是现象更可靠', target: { rule: 'REAL_PHENOMENA' } },
    ],
  },
  {
    id: 'real_caveback', door: 'real', type: 'hesitation',
    title: '犹豫：走出洞穴，然后呢？',
    body: [
      '那个走出洞穴、看见太阳的人，命运是回到洞穴去解放同伴——他重新走入影子的世界，只是不再把影子当真实。',
      '也许哲学的意义不在彼岸，而在返回之后看待此生的方式。',
    ],
    options: [
      { id: 'r_cb_1', label: '那就重新审视“现象”', target: { rule: 'REAL_PHENOMENA' } },
      { id: 'r_cb_2', label: '真实会不会是在历史中展开的？', target: 'real_history' },
    ],
  },
  {
    id: 'real_history', door: 'real', type: 'answer', thinker: '黑格尔',
    title: '真实是正在展开的过程',
    body: [
      '黑格尔说“实体即主体”：真实不是摆在那里的静物，而是一个通过矛盾、否定和扬弃不断理解自身的运动。历史就是精神的自传。',
      '这个图景宏大得令人眩晕——那么具体的、有限的个人，在其中处于什么位置？',
    ],
    options: [
      { id: 'r_h_1', label: '从宏大叙事回到一个具体的人', target: 'real_dasein' },
    ],
  },
  {
    id: 'real_dasein', door: 'real', type: 'answer', thinker: '海德格尔',
    title: '世界，是我们身处其中的世界',
    body: [
      '锤子称手时，你注意不到它；它坏了，才作为“对象”浮现。海德格尔说，我们首先不是面对一堆物体的旁观者，而是已经在世界中操劳、牵挂的存在者。',
      '真实不是躲在现象背后的东西，而是在我们与事物打交道的过程中不断解蔽的发生。',
    ],
    options: [
      { id: 'r_d_1', label: '那么真理是一种“解蔽”', target: 'real_terminal_truth' },
      { id: 'r_d_2', label: '让这种解蔽发生的，是语言吗？', target: 'real_language' },
      { id: 'r_d_3', label: '回到那个问题：现象本身，算真实吗？', target: { rule: 'REAL_PHENOMENA' } },
    ],
  },
  {
    id: 'real_language', door: 'real', type: 'answer', thinker: '海德格尔',
    title: '语言说出世界',
    body: [
      '没有“树”这个词之前，那种植物当然存在；但它作为可以被指认、被追问、被赋予意义的“树”显现，离不开语言。语言不是贴标签的工具，它是世界得以成形的介质。',
      '这带来一个令人不安的推论：不同的语言，是否敞开了不同的真实？',
    ],
    options: [
      { id: 'r_l_1', label: '这会不会取消客观真实，滑向相对主义？', target: 'real_terminal_word' },
      { id: 'r_l_2', label: '去看看在世界中操劳的“解蔽”', target: 'real_dasein' },
    ],
  },
  {
    id: 'real_phenomena_senses', door: 'real', type: 'counter', thinker: '洛克',
    title: '现象就是真实的表层',
    body: [
      '你从经验之路抵达这里。经验论者区分过两类性质：形状、运动属于物体自身；颜色、声音、滋味则依赖感知者。可一旦承认后者，前者的“独立”也开始松动。',
      '也许我们拥有的从来不是物自身，而是一张与感官共同织成的现象之网——问题是，网外是否必须有东西。',
    ],
    options: [
      { id: 'r_ps_1', label: '真实就是向感知显现的全部', target: 'real_terminal_surface' },
    ],
  },
  {
    id: 'real_phenomena_reason', door: 'real', type: 'counter', thinker: '康德',
    title: '现象界与本体界',
    body: [
      '你从理性之路抵达这里，而康德在这里收编了理性：我们可以确定地认识现象界，因为它本就遵循认识的形式；至于本体界，只可被思维，不可被认识。',
      '这不是失败的退守——它让科学在现象界拥有全权，也让自由与道德不必在物理因果中寻找缝隙。',
    ],
    options: [
      { id: 'r_pr_1', label: '真实是经验的边界，不是它的反面', target: 'real_terminal_phenomenon' },
    ],
  },
  {
    id: 'real_phenomena_language', door: 'real', type: 'counter', thinker: '维特根斯坦',
    title: '语言的边界，就是世界的边界',
    body: [
      '你从语言之路抵达这里。一种说法是：语言不是在世界之外映照世界，它划分“什么可以被有意义地说出”。界限之外不是另一个世界，而是沉默。',
      '那么“真实”或许不是一个名词，而是一套说话与行事的方式。',
    ],
    options: [
      { id: 'r_pl_1', label: '真实在可说与可显示之间', target: 'real_terminal_word' },
    ],
  },
  {
    id: 'real_terminal_truth', door: 'real', type: 'terminal',
    title: '终点：真理是解蔽',
    kicker: '你的路径到此收束',
    body: [
      '你没有把真实握成一个对象，却学会了它的动词形式：真实发生在事物从遮蔽中显现的时刻，发生在理论、作品与一次真诚的对话里。',
      '这也意味着，真实需要有人承接——下一扇门问的正是承接它的生活。',
    ],
    relatedThinkers: ['海德格尔', '黑格尔'],
    relatedDoors: ['life'],
  },
  {
    id: 'real_terminal_surface', door: 'real', type: 'terminal',
    title: '终点：表层即全部',
    kicker: '你的路径到此收束',
    body: [
      '如果现象的背后总还有更“真实”的东西，追问将无限后退。也许深刻不在底层，而在表层的丰富纹理之中——学会观看，比假设一个彼岸更难。',
    ],
    relatedThinkers: ['洛克', '休谟'],
    relatedDoors: ['knowledge'],
  },
  {
    id: 'real_terminal_phenomenon', door: 'real', type: 'terminal',
    title: '终点：经验的星空',
    kicker: '你的路径到此收束',
    body: [
      '现象不是真实的障碍，而是真实唯一可以向我们到来的方式。康德头顶的星空属于现象界，心中的道德律属于本体界——人恰好站在两个边界的交界。',
    ],
    relatedThinkers: ['康德'],
    relatedDoors: ['human'],
  },
  {
    id: 'real_terminal_word', door: 'real', type: 'terminal',
    title: '终点：在语言中成形的世界',
    kicker: '你的路径到此收束',
    body: [
      '相对主义的恐惧也许被夸大了：不同语言敞开的世界可以对话、翻译、彼此修正。客观性不必是彼岸的副本，它可以是交谈中不断争取的成果。',
      '看护语言，就是看护世界得以显现的方式。',
    ],
    relatedThinkers: ['海德格尔'],
    relatedDoors: ['human'],
  },

  // ─────────────────────────── 门 04：怎样生活 ───────────────────────────
  {
    id: 'life_root', door: 'life', type: 'root',
    title: '怎样生活？',
    kicker: '在回答之前',
    body: [
      '前三扇门在这里汇合。无论人是什么、知识如何可能、真实如何显现，明天早晨你仍然要起床，仍然要决定怎样度过这一天。',
      '伦理学不是考卷最后的附加题，它是哲学睁开眼的地方。',
    ],
    options: [
      { id: 'l_r_1', label: '培养德性，在中道中实践', target: 'life_virtue' },
      { id: 'l_r_2', label: '承担自由，为自己的选择负责', target: 'life_freedom' },
      { id: 'l_r_3', label: '也许问题本身就有问题——生活是荒诞的', target: 'life_absurd' },
    ],
  },
  {
    id: 'life_virtue', door: 'life', type: 'answer', thinker: '亚里士多德',
    title: '幸福是合德性的实现活动',
    body: [
      '亚里士多德不把好生活理解为一串快乐时刻，而是理解为一生尺度上的“活得好、做得好”：让人特有的理性能力充分实现，这就是 eudaimonia，人的繁盛。',
      '而繁盛的形态，是在每一种情境中命中“中道”——勇敢在鲁莽与怯懦之间，慷慨在挥霍与吝啬之间。',
    ],
    options: [
      { id: 'l_v_1', label: '中道要如何学会？', target: 'life_habit' },
      { id: 'l_v_2', label: '有德性的人遭遇厄运呢？', target: 'life_fortune' },
    ],
  },
  {
    id: 'life_habit', door: 'life', type: 'answer', thinker: '亚里士多德',
    title: '德性是第二自然',
    body: [
      '中道不是算平均数，而是有实践智慧的人在具体情境中辨别出的那个“恰到好处”。它无法写成公式，只能像学手艺一样，在共同体的榜样与反复练习中养成。',
      '你成为什么样的人，取决于你反复做什么样的事。',
    ],
    options: [
      { id: 'l_h_1', label: '中道会不会只是不敢极端的平庸？', target: 'life_mean' },
      { id: 'l_h_2', label: '这种练习需要什么样的共同体？', target: 'life_polis' },
    ],
  },
  {
    id: 'life_mean', door: 'life', type: 'counter',
    title: '反问：中道是和稀泥吗？',
    body: [
      '恰恰相反。在懦夫看来，勇敢本身就是鲁莽；在挥霍者看来，慷慨近乎吝啬。中道要顶住两边的拉扯，它要求的判断力比走极端更多，而不是更少。',
      '何况中道从不保证安全——有时候，“恰到好处”的行动会要一个人的命。',
    ],
    options: [
      { id: 'l_m_1', label: '去看看德性生长的共同体', target: 'life_polis' },
    ],
  },
  {
    id: 'life_polis', door: 'life', type: 'answer', thinker: '亚里士多德',
    title: '人是城邦的动物',
    body: [
      '德性不在孤室里修成。法律、风俗、友谊与公共讨论，构成了好生活的培养皿；脱离城邦而自足的人，亚里士多德说，不是野兽就是神祇。',
      '好生活因此天然带着政治维度：一个败坏的城邦，会批量制造难以做好的人。',
    ],
    options: [
      { id: 'l_p_1', label: '可现代共同体已经碎裂了', target: 'life_modern' },
      { id: 'l_p_2', label: '那么好生活就是人的“繁盛”', target: 'life_terminal_flourish' },
    ],
  },
  {
    id: 'life_fortune', door: 'life', type: 'counter',
    title: '反问：德性足以抵御命运吗？',
    body: [
      '特洛伊老王普里阿摩斯一生公正，却在城破后目睹儿孙被杀、自己惨死。亚里士多德承认：巨大的厄运能碾碎幸福，德性不是刀枪不入的护身符。',
      '但德性让人在厄运中保持高贵，不被压成另一个人——这够吗？后来的斯多葛派给出了更锋利的回答。',
    ],
    options: [
      { id: 'l_f_1', label: '听听斯多葛派怎么说', target: 'life_stoic' },
      { id: 'l_f_2', label: '这个问题到今天变得更尖锐了', target: 'life_modern' },
    ],
  },
  {
    id: 'life_stoic', door: 'life', type: 'answer', thinker: '芝诺',
    title: '区分可控与不可控',
    body: [
      '斯多葛派把世界切成两半：不在我们能力之内的——财富、名声、身体、别人的评价；在我们能力之内的——判断、欲望、对事件的态度。痛苦不来自事情本身，而来自对事情的判断。',
      '命运可以夺走一切外部之物，唯独夺不走你同意什么、拒绝什么的自由。',
    ],
    options: [
      { id: 'l_st_1', label: '这会不会只是教人顺从？', target: 'life_obedience' },
      { id: 'l_st_2', label: '带着这种内在自由走进现代', target: 'life_modern' },
    ],
  },
  {
    id: 'life_obedience', door: 'life', type: 'counter',
    title: '反问：宁静会不会变成冷漠？',
    body: [
      '斯多葛的圣徒并非冷漠的旁观者：改变能改变的、承受不能改变的，前半句要求的行动一点不少。被奴隶、被流放、被判处死刑的爱比克泰德与马可·奥勒留，都不是顺民的形象。',
      '它收回的是对结果的执念，不是对正义的投入。',
    ],
    options: [
      { id: 'l_o_1', label: '那么进入现代的处境', target: 'life_modern' },
    ],
  },
  {
    id: 'life_modern', door: 'life', type: 'hesitation',
    title: '犹豫：当旧的答案失去担保',
    body: [
      '城邦、永恒秩序、上帝——好生活的外部担保一个个退场。自由变成了无人代写的作业，荒诞感从裂缝里长出来：如果宇宙并不关心意义，那么怎样生活，由谁说了算？',
      '两种回应在二十世纪对峙：自己创造意义，或直面荒诞、在反抗中生活。',
    ],
    options: [
      { id: 'l_md_1', label: '意义由我自己创造', target: 'life_freedom' },
      { id: 'l_md_2', label: '先直面荒诞本身', target: 'life_absurd' },
    ],
  },
  {
    id: 'life_freedom', door: 'life', type: 'answer', thinker: '萨特',
    title: '选择，就是塑造',
    body: [
      '没有现成的意义货架供你挑选。每个选择都在三重意义上发生：它为你自己立法，它暗示你认为所有人也可以如此选择，它因此无法推卸给任何人。',
      '责任不是自由的代价，它就是自由本身的重量。',
    ],
    options: [
      { id: 'l_fr_1', label: '可是我生活在他人中间', target: 'life_others' },
      { id: 'l_fr_2', label: '这份责任重得让人眩晕', target: 'life_anguish' },
    ],
  },
  {
    id: 'life_others', door: 'life', type: 'counter', thinker: '萨特',
    title: '反问：自由如何与他人共存？',
    body: [
      '“他人即地狱”常被误读为厌世。萨特的意思是：在他人的目光下，我被凝固成一个对象——被评判、被归类、被定义；而我也这样对他人。',
      '地狱不在别处，在互相客体化的目光里。承认他人同样是不可还原的自由主体，是唯一的出路，也是最难的练习。',
    ],
    options: [
      { id: 'l_ot_1', label: '那么好生活是承担相互的责任', target: 'life_terminal_responsibility' },
    ],
  },
  {
    id: 'life_anguish', door: 'life', type: 'counter', thinker: '萨特',
    title: '焦虑是自由的眩晕',
    body: [
      '站在悬崖边，你恐惧的是坠落，但你同时清楚：没有任何东西阻止你跳下去。那种没有护栏的感觉，就是焦虑。',
      '它不是病理症状，而是自由的正常体温。逃避它的方式——从众、借口、自欺——才是萨特所说的“坏信仰”。',
    ],
    options: [
      { id: 'l_an_1', label: '在眩晕中仍然选择', target: 'life_terminal_responsibility' },
      { id: 'l_an_2', label: '如果意义本身就是一种幻觉呢？', target: 'life_absurd' },
    ],
  },
  {
    id: 'life_absurd', door: 'life', type: 'answer', thinker: '加缪',
    title: '荒诞，是人与世界相遇的声音',
    body: [
      '荒诞不在世界本身，也不在人本身，而在二者的相遇：一个渴求意义的理性，撞上一个沉默、冷漠、无意义的宇宙。',
      '加缪说，真正严肃的哲学问题只有一个——自杀。因为它在判断：生活值得过吗？',
    ],
    options: [
      { id: 'l_ab_1', label: '这个结论为什么不导向自杀？', target: 'life_suicide' },
      { id: 'l_ab_2', label: '不自杀，又要如何活？', target: 'life_revolt' },
    ],
  },
  {
    id: 'life_suicide', door: 'life', type: 'counter', thinker: '加缪',
    title: '反问：为什么不能用死结束荒诞？',
    body: [
      '自杀是一种投降：它用取消提问者的方式取消问题，承认了荒诞配得上人的臣服。哲学上的自杀——投向宗教或某种绝对意义——同理，都是绕开对峙的跳跃。',
      '加缪要的是第三种姿态：不跳，也不走，直视荒诞并与它共存。',
    ],
    options: [
      { id: 'l_su_1', label: '那么剩下的姿态是什么？', target: 'life_revolt' },
    ],
  },
  {
    id: 'life_revolt', door: 'life', type: 'answer', thinker: '加缪',
    title: '反抗、自由与激情',
    body: [
      '西西弗斯被罚永无止境地推石上山，石头又滚回谷底。加缪却说：应当想象西西弗斯是幸福的。当他转身走下山、清醒地意识到全部命运时，他比那块石头更高。',
      '反抗不是为了赢，而是拒绝被简化为因果链上的一环。在必死的限度内活得尽可能饱满，就是对沉默宇宙的回答。',
    ],
    options: [
      { id: 'l_rv_1', label: '我接受这种幸福', target: 'life_terminal_sisyphus' },
      { id: 'l_rv_2', label: '它和古代的“德性”还能调和吗？', target: 'life_virtue' },
    ],
  },
  {
    id: 'life_terminal_responsibility', door: 'life', type: 'terminal',
    title: '终点：承担的伦理',
    kicker: '你的路径到此收束',
    body: [
      '你走到了一种不依赖外部担保的伦理学：意义不是被发现的宝藏，而是在选择、责任与对他人自由的承认中被创造出来的成果。',
      '自由不轻松，但它是唯一真正属于你的东西。',
    ],
    relatedThinkers: ['萨特', '康德'],
    relatedDoors: ['human'],
  },
  {
    id: 'life_terminal_sisyphus', door: 'life', type: 'terminal',
    title: '终点：应当想象西西弗斯幸福',
    kicker: '你的路径到此收束',
    body: [
      '你没有获得意义的承诺，却获得了比承诺更结实的东西：一种清醒的反抗——在无意义的处境里创造意义，在必死的限制里争取自由，在沉默之中保持激情。',
      '斗争本身足以充实一个人的心。',
    ],
    relatedThinkers: ['加缪'],
    relatedDoors: ['real'],
  },
  {
    id: 'life_terminal_flourish', door: 'life', type: 'terminal',
    title: '终点：人的繁盛',
    kicker: '你的路径到此收束',
    body: [
      '你带走的是最古老也最具体的答案：好生活不是一种感觉，而是一种实现活动——在好的共同体中，与好的朋友一起，反复做合德性的事，并用一生来衡量。',
    ],
    relatedThinkers: ['亚里士多德', '芝诺'],
    relatedDoors: ['knowledge'],
  },
];

// ── 版本化 ─────────────────────────────────────────────────────────────
// 每次修订问题文本/分支规则都升版本号。会话创建时钉住版本；
// 旧会话不会被悄悄改写，客户端发现版本落后会收到 409 并显式迁移。
export const VERSIONS = ['1.0.0', '2.0.0', '3.0.0'];

// 修订史：
//   v1 → v2：生活之门补入“共同体（城邦）”支路——德性不再只是个人修炼，
//            习惯之后可以追问“需要什么样的城邦”。
//   v2 → v3：生活之门补斯多葛分支；知识之门补“先定义知道”入口；
//            真实之门补“语言”入口、此在回连现象学的岔路，
//            以及按历史解析的 REAL_PHENOMENA 条件分支。
// 每次会话创建时钉住当时版本；旧会话不会被新内容悄悄改写。

// v2 新增（仅 v1 要裁掉）
const POLIS_REMOVED_OPTIONS = new Set(['l_h_2', 'l_p_1', 'l_p_2', 'l_f_2']);
const POLIS_REPOINT = {
  // 没有城邦支路时，习惯的中道直接收束到“繁盛”；命运之问只剩斯多葛（v3）或现代
  life_habit: { l_h_1: 'life_terminal_flourish' },
};
const POLIS_REMOVED_NODES = new Set(['life_polis']);

// v3 新增（v1、v2 都要裁掉）
const STOIC_REMOVED_OPTIONS = new Set(['l_f_1', 'l_st_1', 'l_st_2']);
const STOIC_REPOINT = {
  // 斯多葛支路缺失时，命运之问的另一条路直接通向现代处境
  life_fortune: { l_f_2: 'life_modern' },
};
const STOIC_REMOVED_NODES = new Set(['life_stoic', 'life_obedience']);

const V3_REMOVED_OPTIONS = new Set([
  'k_r_3', 'k_df_1', 'k_df_2', 'k_df_3',
  'k_t_2', // “去第三扇门”终点在 v3 才有
  'r_r_3', 'r_d_2', 'r_d_3', 'r_l_1', 'r_l_2',
]);
const V3_REPOINT = {
  // 旧版没有“通往真实之门”的过渡终点；边界问题直接收束到“守住边界”
  knowledge_thing: { k_t_1: 'knowledge_terminal_limit' },
};
const V3_REMOVED_NODES = new Set([
  'knowledge_def', 'knowledge_terminal_real',
  'real_language', 'real_phenomena_language', 'real_terminal_word',
]);

function reachableFromRoots(nodeMap, doorIds) {
  const seen = new Set();
  const stack = doorIds.map((id) => `${id}_root`);
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    const node = nodeMap.get(id);
    if (!node) continue;
    seen.add(id); // 终点等叶子节点同样标记为可达
    if (!Array.isArray(node.options)) continue;
    for (const option of node.options) {
      if (typeof option.target === 'string') stack.push(option.target);
      // 条件分支只把“当前版本仍存在”的落点计入可达集
      else if (option.target?.rule) {
        for (const resolved of RULES[option.target.rule]?.resolve.__all__ ?? []) {
          if (nodeMap.has(resolved)) stack.push(resolved);
        }
      }
    }
  }
  return seen;
}

export function buildGraph(version) {
  if (!VERSIONS.includes(version)) throw new Error(`unknown graph version: ${version}`);
  const major = Number(version.split('.')[0]);

  // 让 REAL_PHENOMENA 的全部落点在可达性分析中可见
  RULES.REAL_PHENOMENA.resolve.__all__ = [
    'real_phenomena_senses', 'real_phenomena_reason', 'real_phenomena_language',
  ];

  // 节点全是可序列化的纯数据（target 是字符串或 {rule} 对象，无函数），
  // 不能用 structuredClone：与规则对象的共享引用会触发 DataCloneError。
  let map = new Map(NODES.map((node) => [node.id, JSON.parse(JSON.stringify(node))]));

  const removeOption = (optionId) => {
    for (const node of map.values()) {
      if (!Array.isArray(node.options)) continue;
      node.options = node.options.filter((option) => option.id !== optionId);
    }
  };

  // v1 相对 v2 缺少“城邦”支路
  if (major < 2) {
    POLIS_REMOVED_OPTIONS.forEach(removeOption);
    for (const [nodeId, repoints] of Object.entries(POLIS_REPOINT)) {
      const node = map.get(nodeId);
      if (node) node.options = node.options.map((o) => ({ ...o, target: repoints[o.id] ?? o.target }));
    }
    POLIS_REMOVED_NODES.forEach((id) => map.delete(id));
  }

  // v1/v2 都不含 v3 新增内容：斯多葛分支、知识“定义”入口、真实“语言”支路。
  if (major < 3) {
    V3_REMOVED_OPTIONS.forEach(removeOption);
    STOIC_REMOVED_OPTIONS.forEach(removeOption);
    for (const [nodeId, repoints] of Object.entries(STOIC_REPOINT)) {
      const node = map.get(nodeId);
      if (node) node.options = node.options.map((o) => ({ ...o, target: repoints[o.id] ?? o.target }));
    }
    for (const [nodeId, repoints] of Object.entries(V3_REPOINT)) {
      const node = map.get(nodeId);
      if (node) node.options = node.options.map((o) => ({ ...o, target: repoints[o.id] ?? o.target }));
    }
    V3_REMOVED_NODES.forEach((id) => map.delete(id));
    STOIC_REMOVED_NODES.forEach((id) => map.delete(id));
  }

  // 只保留从各扇门入口真正可达的节点，避免旧版本里悬挂着新内容。
  const reachable = reachableFromRoots(map, DOORS.map((door) => door.id));
  map = new Map([...map].filter(([id]) => reachable.has(id)));

  // 条件规则按版本实例化：旧版本里语言落点不存在，回退到感官落点。
  const rules = {};
  for (const [ruleId, rule] of Object.entries(RULES)) {
    const baseResolve = rule.resolve;
    const all = (rule.resolve.__all__ ?? []).filter((id) => map.has(id));
    rules[ruleId] = {
      id: ruleId,
      resolve(history) {
        const resolved = baseResolve(history);
        return map.has(resolved) ? resolved : 'real_phenomena_senses';
      },
    };
    rules[ruleId].resolve.__all__ = all;
  }

  const nodes = [...map.values()];
  return { version, doors: DOORS, nodes, nodeById: map, rules };
}

export const CURRENT_VERSION = '3.0.0';
