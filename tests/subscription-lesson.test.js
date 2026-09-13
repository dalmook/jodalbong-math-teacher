import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceLesson} from '../lesson.js';
import {dispatchText,parseSpokenNumber,sanitizeState,teacherPrompt} from '../subscription-lesson.js';
test('completed Korean utterances drive real lesson grading, correction and next',()=>{
 const l=new VoiceLesson(); const say=t=>dispatchText(l,t);
 assert.equal(say('모르겠어요').state.question_kind,'small_step');
 assert.equal(say('2요').result,'step_correct');
 assert.equal(say('삼이요').result,'step_correct');
 assert.equal(say('열셋이요').result,'correct');
 assert.equal(say('아니, 12라고 했어').result,'wrong');assert.equal(l.solved,0);
 assert.equal(say('아니, 십삼이라고 했어').result,'correct');
 assert.equal(say('네').state.number,2);
 assert.equal(say('곱셈 하자').state.operation_code,'mul');
 assert.equal(say('더 어렵게').state.level,'challenge');
 assert.equal(say('그만할래').end,true);
});
test('hints, visual, skip, explicit review, ambiguity and privacy',()=>{
 const l=new VoiceLesson();const say=t=>dispatchText(l,t);
 assert.equal(say('다음 문제').ok,false);
 assert.equal(say('답 알려줘').state.hint_level,1);
 assert.equal(say('그림으로').state.visual,true);
 const before=JSON.stringify(l.state());say('2 아니면 13');assert.equal(JSON.stringify(l.state()),before);
 assert.equal(say('010-1234-5678').error,'PRIVATE_INPUT');
 assert.equal(say('건너뛰자').state.skipped,1);
 assert.equal(say('풀이를 배우고 넘어갈래').ok,false);
 say('999');assert.equal(say('풀이를 배우고 넘어갈래').state.phase,'review');
});
test('bounded numbers and sanitized context never expose hidden solution',()=>{
 for(const t of ['-1','1.5','1000','13abc','2 또는 3'])assert.equal(parseSpokenNumber(t),null);
 for(const [t,n] of [['2요',2],['십삼이요',13],['백이십삼',123],['열셋',13]])assert.equal(parseSpokenNumber(t),n);
 const s=sanitizeState({...new VoiceLesson().state(),answer:13,explanation:'secret',evil:'x'});
 assert.ok(!('answer' in s));assert.ok(!('evil' in s));assert.ok(!JSON.stringify(s).includes('13'));
 assert.match(teacherPrompt(s),/여성/);assert.doesNotMatch(teacherPrompt(s),/call check_answer/);
});
