/**
 * Skill system — unlockable abilities at combo milestones.
 * Inspired by Qt-Gaming's skill bar + playCastAnimation.
 *
 * Skill 1 (combo 5): Time Freeze — pause timer 3s
 * Skill 2 (combo 10): Double Score — next word 2x
 * Skill 3 (combo 15): Skip — blade wave destroy current word
 */
(function(V8) {
  'use strict';

  const SKILLS = V8.CFG.SKILLS;
  let skillState = null; // { unlocked: Set, used: Set, activeSkill: null, doubleNext: false }

  function init() {
    skillState = { unlocked: new Set(), used: new Set(), activeSkill: null, doubleNext: false };
    updateSkillBar();
  }

  function reset() { init(); }

  /** Called when combo hits a milestone. */
  function onComboMilestone(tier) {
    if (!skillState) return;
    for (const s of SKILLS) {
      if (s.comboReq <= tier * 5 && !skillState.unlocked.has(s.id)) {
        skillState.unlocked.add(s.id);
        V8.bus.emit('skill:unlock', { id: s.id, name: s.name });
        V8.bigText(s.icon + ' ' + s.name + ' 解锁!', '#ffd700');
        V8.sfx.evolve();
      }
    }
    updateSkillBar();
  }

  function correctAnswer(word, mode) {
    return mode === 0 ? word.e : word.c.join('；');
  }

  function revealSkippedAnswer(word, mode) {
    const overlay = document.createElement('div');
    overlay.className = 'skip-answer-reveal';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'assertive');

    const label = document.createElement('div');
    label.className = 'skip-answer-label';
    label.textContent = '正确答案';
    const answer = document.createElement('div');
    answer.className = 'skip-answer-value';
    answer.textContent = correctAnswer(word, mode);
    overlay.append(label, answer);
    document.body.appendChild(overlay);
    return overlay;
  }

  /** Try to use a skill by index (0-2). */
  function useSkill(idx, gameState) {
    if (!skillState) return false;
    if (idx < 0 || idx >= SKILLS.length) return false;
    const s = SKILLS[idx];
    if (!skillState.unlocked.has(s.id) || skillState.used.has(s.id)) return false;
    if (skillState.activeSkill) return false; // one at a time
    if (gameState.lock || gameState.rdy || gameState.over || gameState.dead) return false;

    skillState.used.add(s.id);
    skillState.activeSkill = s.id;

    // Play cast animation: player briefly switches to special frame
    const ch = document.getElementById('char');
    if (ch) { ch.style.filter = 'brightness(1.5)'; setTimeout(() => { ch.style.filter = ''; }, 400); }

    switch (s.id) {
      case 'freeze':
        V8.timer.freezeFor(3000, gameState);
        V8.bigText('计时冻结 3 秒', '#9eeaff');
        break;
      case 'double':
        skillState.doubleNext = true;
        V8.coinRainFX(document.getElementById('scoreBox'));
        V8.bigText('下一题积分 ×2', '#ffd700');
        break;
      case 'skip':
        // A skipped word is not a correct answer, so it breaks the timed
        // consecutive-answer chain before moving to the next word.
        if (V8.streak) V8.streak.reset();
        gameState.lock = true;
        V8.ui.setInputEnabled(false);
        const word = V8.words.currentWord(gameState);
        const runId = gameState.runId;
        const sign = document.getElementById('sign');
        if (sign) sign.classList.add('skipping');
        V8.daolangFX(document.getElementById('sign'));
        setTimeout(() => {
          if (gameState.runId !== runId) return;
          const reveal = revealSkippedAnswer(word, gameState.mode);
          V8.sfx.ding();
          setTimeout(() => {
            if (gameState.runId !== runId) { reveal.remove(); return; }
            reveal.remove();
            if (sign) sign.classList.remove('skipping');
            gameState.done++;
            skillState.activeSkill = null;
            // The reveal owns this lock only until the word advances. A world
            // shift may start synchronously inside advance() and must capture
            // the unlocked state rather than restoring this stale skip lock.
            gameState.lock = false;
            const isComplete = V8.words.advance(gameState);
            if (isComplete) {
              V8.ui.updateHUD(gameState);
              V8.ui.showVictory(gameState);
            } else {
              V8.timer.resetWord(gameState);
              V8.words.displayNextWord(gameState);
              V8.ui.updateHUD(gameState);
              const shifting = Boolean(gameState._worldShiftLock);
              V8.ui.setInputEnabled(!shifting);
              if (!shifting) V8.ui.focusInput();
            }
            updateSkillBar();
          }, 2200);
        }, 360);
        break;
    }

    if (s.id === 'freeze') {
      setTimeout(() => { skillState.activeSkill = null; updateSkillBar(); }, 3000);
    } else if (s.id === 'double') {
      setTimeout(() => { skillState.activeSkill = null; updateSkillBar(); }, 420);
    }

    V8.bus.emit('skill:used', { id: s.id });
    updateSkillBar();
    return true;
  }

  /** Check if next word gets double score. */
  function consumeDouble() {
    if (!skillState || !skillState.doubleNext) return false;
    skillState.doubleNext = false;
    skillState.activeSkill = null;
    updateSkillBar();
    return true;
  }

  function hasDouble() { return skillState && skillState.doubleNext; }

  /** Update the skill bar UI. */
  function updateSkillBar() {
    const bar = document.getElementById('skillBar');
    if (!bar) return;
    if (!skillState) { bar.innerHTML = ''; return; }

    let html = '';
    SKILLS.forEach((s, i) => {
      const unlocked = skillState.unlocked.has(s.id);
      const used = skillState.used.has(s.id);
      const active = skillState.activeSkill === s.id;
      const armed = s.id === 'double' && skillState.doubleNext;
      const cls = armed ? 'skill-icon armed' : active ? 'skill-icon active' : used ? 'skill-icon used' : unlocked ? 'skill-icon ready' : 'skill-icon locked';
      const stateLabel = armed ? '待生效' : active ? '生效中' : used ? '已用' : unlocked ? s.key : `${s.comboReq}连击`;
      const disabled = !unlocked || used || active;
      html += `<button type="button" class="${cls}" onclick="V8.skills.use(${i})" title="${s.name}: ${s.desc}" aria-label="${s.name}: ${s.desc}"${disabled ? ' disabled' : ''}><span class="skill-symbol">${unlocked ? s.icon : '🔒'}</span><span class="skill-name">${s.name}</span><small>${stateLabel}</small></button>`;
    });
    bar.innerHTML = html;

    const score = document.getElementById('scoreBox');
    const sign = document.getElementById('sign');
    const bonus = document.getElementById('wordBonus');
    const armed = Boolean(skillState.doubleNext);
    if (score) score.classList.toggle('double-armed', armed);
    if (sign) sign.classList.toggle('double-armed', armed);
    if (bonus) {
      bonus.textContent = armed ? '×2 下一题' : '';
      bonus.classList.toggle('on', armed);
    }
  }

  function use(idx) {
    const GS = V8._gameState;
    if (!GS) return;
    if (!V8.state.allows('skill')) return;
    V8.ac && V8.ac();
    useSkill(idx, GS);
  }

  V8.skills = { init, reset, onComboMilestone, useSkill, consumeDouble, hasDouble, updateSkillBar, use };
})(window.V8 = window.V8 || {});
