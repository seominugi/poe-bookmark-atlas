// 업데이트 노트 — 무엇이 바뀌었는지 사용자에게 알리는 유일한 통로.
// 스토어 설명은 **기존 사용자가 보지 않는다**. 알리지 않으면 만든 기능이 발견되지 않는다.
//
// 릴리즈할 때 맨 앞에 항목을 추가한다(최신순 유지 — 테스트가 정렬을 강제한다).
// 문구는 개발 용어가 아니라 **사용자가 겪는 변화**로 쓴다. 커밋 제목을 그대로 옮기지 말 것.
export const UPDATE_NOTES = [
  {
    version: '0.9.2',
    date: '2026-08-18',
    title: '폴더가 사라지던 문제와 영문 거래소',
    items: [
      '같은 폴더가 리그마다 여러 번 보이던 것을 하나로 정리했어요. 그중 비어 보이는 폴더를 지우면 원래 폴더까지 사라지던 문제가 없어집니다.',
      '폴더를 지울 때 안에 든 북마크 수를 먼저 알려주고, 지운 뒤에는 되돌릴 수 있어요.',
      '지금 보고 있는 리그가 아닌 북마크에는 리그 이름표가 붙습니다. 끝난 리그는 노란색으로 표시돼요.',
      '영문 거래소(pathofexile.com)를 설치 직후부터 바로 쓸 수 있습니다. PoB 복사도 영문 원본 그대로 나가요.',
    ],
  },
]

/**
 * 버전 문자열 비교. `a > b` 면 양수, 같으면 0, 작으면 음수.
 * 문자열 비교를 쓰면 안 된다 — '0.9.10' < '0.9.2' 가 되어 새 버전을 건너뛴다.
 * null/undefined 는 "본 적 없음"이라 어떤 버전보다도 앞선다.
 */
export function cmpVersion(a, b) {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * 보여줄 노트 — `seen` 이후이면서 `current` 이하인 것만, 최신순.
 * 자동 업데이트는 사용자가 모르는 사이 여러 번 일어나므로 **누적**해서 보여준다.
 * `current` 상한이 중요하다 — 다음 릴리즈 노트를 미리 적어두어도 배포 전까지는 새지 않는다.
 * @param {string|null} seen 마지막으로 확인(또는 '더 이상 안 보기')한 버전
 * @param {string} current 지금 설치된 버전
 */
export function notesSince(seen, current, notes = UPDATE_NOTES) {
  return notes.filter((n) => cmpVersion(n.version, seen) > 0 && cmpVersion(n.version, current) <= 0)
}

/** 알릴 것이 있는가 — 토스트를 띄울지 판단한다. */
export function hasUnseen(seen, current, notes = UPDATE_NOTES) {
  return notesSince(seen, current, notes).length > 0
}
