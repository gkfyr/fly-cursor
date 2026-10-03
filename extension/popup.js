const status = document.getElementById('status');
const start = document.getElementById('start');
async function send(type) {
  const result = await chrome.runtime.sendMessage({type});
  if (!result?.ok) throw Error(result?.error || '확장 프로그램 응답이 없습니다.');
  return result;
}
start.onclick = async () => {
  start.disabled = true;
  try { await send('START'); window.close(); }
  catch (error) { status.textContent = error.message; }
  finally { start.disabled = false; }
};
document.getElementById('stop').onclick = async () => {
  try { await send('STOP'); status.textContent = '정지했습니다.'; }
  catch (error) { status.textContent = error.message; }
};
send('STATUS').then(result => {
  status.textContent = `${result.meta.neurons.toLocaleString()} 뉴런 연결됨 · ${result.active ? '실행 중' : '준비 완료'}`;
  start.disabled = false;
}).catch(() => { status.textContent = '서버에 연결할 수 없습니다. 아래 실행 안내를 확인하세요.'; });
