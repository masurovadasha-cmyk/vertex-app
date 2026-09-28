/* Device-local reviewed FAQ memory and browser speech. No remote model training. */
(()=>{
  'use strict';
  const dialog=document.getElementById('conciergeDemo');if(!dialog)return;
  const storeKey='vertex-concierge-learning-v1';
  let entries=[],voiceEnabled=false,last=null,storageError=false;
  const english=()=>document.documentElement.lang==='en';
  const t=(ru,en)=>english()?en:ru;
  const normalize=s=>s.toLowerCase().replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/g,' ').trim();
  try{const data=JSON.parse(localStorage.getItem(storeKey)||'[]');if(Array.isArray(data))entries=data.filter(x=>typeof x.question==='string'&&typeof x.answer==='string'&&x.question.length<=1000&&x.answer.length<=2000).slice(0,100);}catch{storageError=true;}
  function persist(){try{localStorage.setItem(storeKey,JSON.stringify(entries));return true;}catch{storageError=true;status(t('Память устройства недоступна. Ответ не сохранён.','Device storage is unavailable. The answer was not saved.'));return false;}}
  const controls=document.createElement('section');controls.className='concierge-tools';
  controls.innerHTML='<div class="concierge-tool-buttons"><button type="button" id="voiceToggle" aria-pressed="false"></button><button type="button" id="voiceRepeat"></button><button type="button" id="voiceStop"></button><button type="button" id="learnToggle" aria-expanded="false"></button></div><p id="voiceStatus" role="status"></p><section id="learningPanel" hidden><h3 id="learningTitle"></h3><p id="learningNotice"></p><form id="teachForm"><label id="teachQuestionLabel" for="teachQuestion"></label><input id="teachQuestion" required maxlength="1000"><label id="teachAnswerLabel" for="teachAnswer"></label><textarea id="teachAnswer" required maxlength="2000" rows="4"></textarea><button class="dark" type="submit" id="teachSave"></button></form><div id="learnedList"></div></section>';
  document.getElementById('conciergeDisclosure').after(controls);
  const get=id=>controls.querySelector('#'+id);
  function status(s){get('voiceStatus').textContent=s;}
  function stopSpeech(){if(window.vertexNativeVoice)window.prompt('vertex-tts:'+JSON.stringify({action:'stop'}),'');else window.speechSynthesis?.cancel();}
  function speak(value){
    if(window.vertexNativeVoice){const result=window.prompt('vertex-tts:'+JSON.stringify({action:'speak',text:value,lang:/[а-яё]/i.test(value)?'ru-RU':'en-US'}),'');status(result==='ok'?t('Озвучивание передано голосовому движку телефона.','Speech sent to your phone voice engine.'):result==='missing-language'?t('Установите русский или английский голос в настройках синтеза речи Android.','Install the Russian or English voice in Android text-to-speech settings.'):t('Голос телефона ещё не готов. Повторите попытку.','Phone speech is not ready. Try again.'));return;}
    if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window)){status(t('Этот браузер не поддерживает озвучивание. Текстовые ответы доступны.','This browser does not support speech. Text replies remain available.'));return;}
    speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(value);
    utterance.lang=/[а-яё]/i.test(value)?'ru-RU':'en-US';
    const voices=speechSynthesis.getVoices();const matching=voices.find(v=>v.lang.toLowerCase().startsWith(utterance.lang.slice(0,2))&&v.localService)||voices.find(v=>v.lang.toLowerCase().startsWith(utterance.lang.slice(0,2)));
    if(matching)utterance.voice=matching;
    utterance.onstart=()=>status(t('Озвучиваю ответ…','Reading the answer…'));
    utterance.onend=()=>status(t('Озвучивание завершено.','Speech finished.'));
    utterance.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))status(t('Не удалось озвучить. Проверьте голос и звук на устройстве.','Could not play speech. Check your device voice and audio settings.'));};
    speechSynthesis.speak(utterance);
  }
  function list(){
    get('learnedList').replaceChildren();entries.forEach((x,index)=>{const row=document.createElement('div');row.className='learned-row';const content=document.createElement('div');const q=document.createElement('strong');q.textContent=x.question;const answer=document.createElement('p');answer.textContent=x.answer;content.append(q,answer);const remove=document.createElement('button');remove.type='button';remove.textContent=t('Удалить','Remove');remove.onclick=()=>{const prior=entries;entries=entries.filter((_,i)=>i!==index);if(!persist())entries=prior;list();refresh();};row.append(content,remove);get('learnedList').append(row);});
  }
  function refresh(){
    get('voiceToggle').textContent=voiceEnabled?t('Голос: включён','Voice: on'):t('Включить голос','Enable voice');
    get('voiceToggle').setAttribute('aria-pressed',String(voiceEnabled));get('voiceRepeat').textContent=t('Слушать ответ','Listen');get('voiceStop').textContent=t('Стоп','Stop');
    get('learnToggle').textContent=t('Память','Memory')+' · '+entries.length;get('learningTitle').textContent=t('Обучить ответу','Teach an answer');
    get('learningNotice').textContent=t('Исправьте ответ и сохраните. При повторении этого вопроса консьерж использует вашу версию. Только на этом устройстве, до 100 ответов; это не переобучение OpenAI. Не сохраняйте пароли, коды доступа или данные гостей.','Correct an answer and save it. Repeating that question uses your version. Up to 100 answers on this device only; this does not retrain OpenAI. Do not save passwords, access codes or guest data.');
    get('teachQuestionLabel').textContent=t('Вопрос','Question');get('teachAnswerLabel').textContent=t('Проверенный вами ответ','Answer you have reviewed');get('teachSave').textContent=t('Запомнить ответ','Remember answer');
    if(storageError)status(t('Проверьте разрешение браузера на локальное хранение.','Check that browser local storage is allowed.'));
    list();
  }
  get('voiceToggle').onclick=()=>{voiceEnabled=!voiceEnabled;refresh();if(voiceEnabled)speak(last?.answer||t('Голосовые ответы включены. Задайте вопрос консьержу.','Voice replies are enabled. Ask the concierge a question.'));else{stopSpeech();status(t('Голос выключен.','Voice is off.'));}};
  get('voiceRepeat').onclick=()=>{const answer=last?.answer||document.querySelector('#conciergeMessages .assistant:last-child p')?.textContent;if(answer)speak(answer);};
  get('voiceStop').onclick=()=>{stopSpeech();status(t('Озвучивание остановлено.','Speech stopped.'));};
  get('learnToggle').onclick=()=>{const panel=get('learningPanel');panel.hidden=!panel.hidden;get('learnToggle').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){get('teachQuestion').value=last?.question||'';get('teachAnswer').value=last?.answer||'';get('teachQuestion').focus();}};
  get('teachForm').onsubmit=e=>{
    e.preventDefault();const question=get('teachQuestion').value.trim(),answer=get('teachAnswer').value.trim();if(!question||!answer)return;
    if(/sk-[a-z0-9_-]{12,}|(?:парол|password|door code|код двери|код доступа|api[_ -]?key)/i.test(question+' '+answer)){status(t('Не сохраняйте ключи, пароли и коды доступа в демо-памяти.','Do not save keys, passwords or access codes in demo memory.'));return;}
    const index=entries.findIndex(x=>normalize(x.question)===normalize(question));if(index<0&&entries.length>=100){status(t('Память заполнена. Удалите ненужный ответ.','Memory is full. Remove an unused answer.'));return;}
    const prior=entries.slice();const item={question,answer,updatedAt:new Date().toISOString()};if(index<0)entries.push(item);else entries[index]=item;
    if(!persist()){entries=prior;return;}refresh();status(t('Запомнил. Повторите этот вопрос, чтобы проверить ответ.','Remembered. Repeat the question to check the answer.'));
  };
  window.addEventListener('vertex-concierge-answer',e=>{last=e.detail;if(voiceEnabled)speak(last.answer);});
  dialog.addEventListener('close',stopSpeech);
  new MutationObserver(refresh).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  window.VertexConciergeLearning={entries:()=>entries.map(x=>({...x}))};refresh();
})();
