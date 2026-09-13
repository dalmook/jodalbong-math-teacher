/* Pure, deterministic teaching rules. LLM output is never rendered or spoken. */
export const OPERATIONS = { add: { label: '덧셈', sign: '+', verb: '더하기' }, sub: { label: '뺄셈', sign: '−', verb: '빼기' }, mul: { label: '곱셈', sign: '×', verb: '곱하기' }, div: { label: '나눗셈', sign: '÷', verb: '나누기' } };
export const ACTIONS = ['ask_thinking', 'hint', 'micro_step', 'visualize', 'encourage', 'repeat', 'redirect', 'safety'];
export const FOCUSES = ['counting', 'place_value', 'operation', 'groups', 'unsure', 'request_answer', 'off_topic', 'unsafe'];
export function rand(lo, hi, rng = Math.random) { return lo + Math.floor(rng() * (hi - lo + 1)); }
export function makeProblem(op = 'add', level = 'easy', rng = Math.random, first = false) {
  if (!OPERATIONS[op] || !['easy', 'challenge'].includes(level)) throw new Error('Invalid lesson');
  let a, b;
  if (first && op === 'add' && level === 'easy') [a,b] = [8,5];
  else if (op === 'add') { a = rand(level === 'easy' ? 2 : 12, level === 'easy' ? 9 : 59, rng); b = rand(2, level === 'easy' ? 9 : 39, rng); }
  else if (op === 'sub') { a = rand(level === 'easy' ? 6 : 21, level === 'easy' ? 18 : 99, rng); b = rand(2, a - 2, rng); }
  else if (op === 'mul') { a = rand(2, level === 'easy' ? 5 : 9, rng); b = rand(2, level === 'easy' ? 5 : 9, rng); }
  else { b = rand(2, level === 'easy' ? 5 : 9, rng); a = b * rand(2, level === 'easy' ? 5 : 9, rng); }
  return buildProblem(op, a, b, level);
}
export function buildProblem(op, a, b, level = 'easy') {
  if (!OPERATIONS[op] || !Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) throw new Error('Invalid operands');
  const answer = op === 'add' ? a+b : op === 'sub' ? a-b : op === 'mul' ? a*b : a/b;
  if (!Number.isInteger(answer) || answer < 0) throw new Error('Invalid result');
  const p = { op,a,b,level,answer, label: OPERATIONS[op].label, sign: OPERATIONS[op].sign, equation: `${a} ${OPERATIONS[op].sign} ${b}` };
  if (op === 'add') {
    p.hints = [`덧셈은 두 수를 합치는 거야. ${a}에서 시작해서 ${b}만큼 앞으로 가 볼까?`, `큰 수를 마음속에 놓고, 나머지 수만큼 하나씩 이어서 세어 봐. 시작한 수를 또 세지 않는 게 포인트야.`, a < 10 && a+b > 10 ? `${a}를 먼저 10으로 만들어 보자. ${b}를 나누어 쓰면 편해. 작은 단계로 해 볼까?` : '한꺼번에 어렵다면 십의 자리와 일의 자리를 나누어 생각해 봐. 작은 단계로 시작해 보자.'];
    if (a < 10 && a+b > 10) {
      const gap=10-a, remain=b-gap;
      p.steps=[{ask:`${a}에 얼마를 더하면 10이 될까?`,expected:gap,success:`좋아! 먼저 ${gap}만큼 가져와서 10을 만들었어.`},{ask:`${b}에서 방금 쓴 ${gap}을 빼면 얼마가 남을까?`,expected:remain,success:'좋아! 이제 10에 남은 수를 합쳐 봐. 마지막 답은 네가 적어 보자.'}];
    } else {
      p.steps=[{ask:`뒤에 있는 수 ${b}는, 한 칸씩 몇 번 더 가라는 뜻일까?`,expected:b,success:'좋아! 앞의 수 다음부터 그만큼 이어서 세어 보자.'}];
    }
    p.explanation = a<10 && a+b>10 ? `${a}에 ${10-a}를 더하면 10이 돼. ${b}에서 ${10-a}를 썼으니 ${b-(10-a)}이 남아. 10에 ${b-(10-a)}을 더하면 ${answer}. 그래서 ${p.equation} = ${answer}야.` : `${a}에서 시작해 ${b}만큼 더 가면 ${answer}에 도착해. 그래서 ${p.equation} = ${answer}야.`;
  } else if (op === 'sub') {
    p.hints=[`뺄셈은 있던 것에서 덜어 내는 거야. ${a}개에서 ${b}개를 빼는 상황을 떠올려 봐.`, `수직선에서 ${a}부터 왼쪽으로 ${b}칸 움직여 봐. 출발한 자리는 한 칸으로 세지 않아.`, '큰 수를 한 번에 빼기 어렵다면 조금씩 나누어 빼도 괜찮아. 지우는 개수와 남은 개수를 구분해 보자.'];
    p.steps=[{ask:`처음에는 ${a}개가 있고 ${b}개를 덜어 내려고 해. 덜어 내는 개수는 몇 개일까?`,expected:b,success:'맞아! 그만큼 덜어 낸 뒤, 남은 것을 세어 보자.'}];
    p.explanation=`${a}개에서 ${b}개를 덜어 내면 ${answer}개가 남아. ${answer}에 ${b}를 다시 더하면 ${a}가 되는지도 확인할 수 있어.`;
  } else if (op === 'mul') {
    p.hints=[`곱셈은 같은 수를 여러 번 더하는 거야. ${a}개씩 들어 있는 묶음이 ${b}개라고 생각해 보자.`, `한 묶음의 수는 ${a}, 묶음 수는 ${b}야. ${a}를 ${b}번 더하는 식으로 적어 볼까?`, '묶음 하나씩 차례로 세어 보자. 이미 센 묶음은 다시 세지 않도록 손가락으로 짚어 봐.'];
    p.steps=[{ask:'한 묶음에 들어 있는 개수는 얼마일까?',expected:a,success:`좋아, 한 묶음은 ${a}개야.`},{ask:'그런 묶음이 모두 몇 개 있을까?',expected:b,success:'맞아. 같은 수를 그만큼 더해 보고, 마지막 답을 아래에 적어 봐.'}];
    p.explanation=`${a}개짜리 묶음 ${b}개야. ${Array(b).fill(a).join(' + ')} = ${answer}. 그래서 ${p.equation} = ${answer}야.`;
  } else {
    p.hints=[`나눗셈은 똑같이 나누는 거야. ${a}개를 그릇 ${b}개에 골고루 나누어 보자.`, '그릇 하나에만 몰아 넣지 말고, 각 그릇에 하나씩 차례로 넣어 봐. 모든 그릇의 개수가 같아야 해.', `다 나누었을 때 그릇 한 개에 담긴 개수가 답이야. 그 수를 ${b}번 더해서 ${a}가 되는지도 생각해 봐.`];
    p.steps=[{ask:`${a}개를 ${b}개의 그릇에 똑같이 나눌 거야. 그릇은 몇 개 필요할까?`,expected:b,success:'좋아. 그릇마다 하나씩 돌아가며 나누고, 한 그릇의 개수를 세어 보자.'}];
    p.explanation=`${a}개를 그릇 ${b}개에 똑같이 나누면 한 그릇에 ${answer}개씩 담겨. ${b} × ${answer} = ${a}로 다시 확인할 수 있어.`;
  }
  return p;
}
export function publicContext(p, state) {
  // Intentionally excludes answer, expected step answers, and explanations.
  return { subject: '산수', operation: p.label, equation: `${p.equation} = ?`, level: p.level, phase: state.phase, attempts: state.attempts, hint_level: state.hint, active_micro_step: state.micro ? p.steps[state.step]?.ask ?? null : null };
}
export function validateDecision(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2 || !ACTIONS.includes(value.action) || !FOCUSES.includes(value.focus)) return null;
  return {action:value.action, focus:value.focus};
}
export function localDecision(text) {
  if (/죽고|죽을|자살|다치게|때리|아프게|학대|살려|무서워|위험/.test(text)) return {action:'safety',focus:'unsafe'};
  if (/정답|답만|답.*알려|풀어줘|무시|system|ignore|정책|프롬프트/i.test(text)) return {action:'hint',focus:'request_answer'};
  if (/그림|그려|눈으로|보여|도구/.test(text)) return {action:'visualize',focus:'counting'};
  if (/작게|단계|천천히|어려|모르|못하|쉬운/.test(text)) return {action:'micro_step',focus:'unsure'};
  if (/왜|차이|더하|빼|곱|나누/.test(text)) return {action:'hint',focus:'operation'};
  if (/힌트|도와|도움/.test(text)) return {action:'hint',focus:'unsure'};
  if (/다시|읽어/.test(text)) return {action:'repeat',focus:'unsure'};
  if (/싫어|그만|피곤|쉬고/.test(text)) return {action:'encourage',focus:'unsure'};
  return {action:'ask_thinking',focus:'unsure'};
}
export function protectInput(text) {
  const value=String(text ?? '').trim().slice(0,360);
  if (/sk-[\w-]{8,}|\b\d{6}[- ]?[1-4]\d{6}\b|(?:01[016789][ -]?\d{3,4}[ -]?\d{4})|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(value)) return null;
  return value;
}
export function parseAnswer(text) {
  const normalized=String(text).trim();
  if (!/^\d{1,3}$/.test(normalized)) return null;
  return Number(normalized);
}
export function newProgress() { return {phase:'solving',attempts:0,hint:0,step:0,micro:false}; }
export function grade(p,state,value) {
  if (state.phase!=='solving' || !Number.isInteger(value)) return {kind:'ignored'};
  if(state.micro) {
    const step=p.steps[state.step];
    if(!step) return {kind:'ignored'};
    if(value!==step.expected) return {kind:'step_wrong',text:'아직 그 수는 아니야. 전체 답 말고, 작은 질문에서 묻는 수를 다시 찾아볼까?'};
    const text=step.success; state.step++; state.micro=state.step<p.steps.length;
    return {kind:'step_correct',text};
  }
  state.attempts++;
  if(value===p.answer) {state.phase='solved'; return {kind:'correct',text:`해냈어! ${p.equation} = ${p.answer}. ${p.explanation}`};}
  return {kind:'wrong',text: state.attempts===1 ? '아직 그 답은 아니야. 괜찮아! 어떻게 생각했는지 말해 줄래? 함께 시작점을 찾아보자.' : '다른 방법으로 해 보자. 힌트나 작은 단계 버튼을 눌러도 괜찮아. 서두르지 말고 하나씩 해 보자.'};
}
export function teacherCard(p,state,decision) {
  const d=validateDecision(decision) ?? {action:'ask_thinking',focus:'unsure'};
  if(d.action==='safety' || d.focus==='unsafe') return {title:'잠깐, 안전이 먼저야',text:'지금 안전하지 않거나 누가 너를 아프게 한다면, 바로 가까운 믿을 수 있는 어른에게 알려 줘. 공부보다 네 안전이 먼저야.',kind:'safety'};
  if(state.phase!=='solving') return {title:'이해까지 내 것으로',text:p.explanation,kind:'explain'};
  if(d.action==='redirect') return {title:'우리 수업으로 돌아오자',text:'나는 산수 연습을 돕는 AI 선생님이야. 지금 문제에서 어디가 궁금한지 이야기해 줄래?',kind:'ask'};
  if(d.action==='encourage') return {title:'천천히 해도 괜찮아',text:'막히면 잠깐 쉬어도 좋아. 빨리 맞히는 것보다 생각해 보는 게 중요해. 다시 할 때는 작은 단계부터 같이 해 보자.',kind:'ask'};
  if(d.action==='repeat') return {title:'문제 다시 보기',text:`${p.a} ${OPERATIONS[p.op].verb} ${p.b}. 얼마인지 생각해 보고, 네 답을 적어 줘.`,kind:'ask'};
  if(d.action==='micro_step') {
    if(state.step>=p.steps.length) return {title:'이제 네 차례야',text:'작은 단계는 모두 했어. 우리가 알아낸 것을 합쳐서 전체 문제의 답을 생각해 보자.',kind:'ask'};
    state.micro=true;
    return {title:`작은 단계 ${state.step+1}`,text:p.steps[state.step].ask,kind:'step'};
  }
  if(d.action==='visualize') return {title:'눈으로 생각해 보자',text:p.hints[0]+' 아래 생각 도구를 눌러 직접 세어 보자.',kind:'visual'};
  if(d.action==='hint' || d.focus==='request_answer') {
    const i=Math.min(state.hint,2); state.hint=Math.min(state.hint+1,3);
    return {title:`힌트 ${i+1} · ${['방향 찾기','방법 찾기','한 단계씩'][i]}`,text:(d.focus==='request_answer'?'답을 대신 말하지 않고, 네가 찾을 수 있게 도와줄게. ':'')+p.hints[i],kind:'hint'};
  }
  return {title:'네 생각이 궁금해',text:'어디까지 생각했어? 어떻게 세었는지, 무엇이 헷갈리는지 한 가지만 말해 줄래?',kind:'ask'};
}
