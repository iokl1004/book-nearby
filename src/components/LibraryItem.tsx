import { useState, type MouseEvent } from 'react'
import { formatDistance, homepageLabel, type LibraryWithAvailability } from '../api'
import { openStatus } from '../hours'

// 운영 상태를 알면 "운영 중 · 22:00까지"처럼, 모르면 운영시간 원문을, 원문도 없으면 확인 방법을 안내한다.
// ("정보 없음"만 보여주면 문을 닫은 건지 정보가 빠진 건지 헷갈리기 때문)
function OpenState({ lib }: { lib: LibraryWithAvailability }) {
  const { hours } = lib
  const status = openStatus(hours)
  const known = status.kind !== 'unknown'
  return (
    <>
      <span className={`open-state ${status.kind}`}>
        {known
          ? <b>{status.label}</b>
          : hours?.text
            ? <span className="hours-text">🕘 {hours.text}</span>
            : <b>{lib.tel ? '운영시간은 전화로 확인해 주세요' : '운영시간은 도서관에 확인해 주세요'}</b>}
        {hours?.closeDay && <> · 휴관 {hours.closeDay}</>}
      </span>
      {/* 시간은 해석했어도 원문이 따로 있으면(오늘 휴관 등) 함께 보여준다 */}
      {known && hours?.text && <span className="open-state hours-text">🕘 {hours.text}</span>}
    </>
  )
}

// 클립보드 API가 막힌 환경(권한 설정, 일부 인앱 브라우저)에서는 권한이 필요 없는 예전 방식으로 한 번 더 시도한다
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;opacity:0'
    document.body.append(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

// 항목 안의 복사 버튼·전화·홈페이지를 누를 때 도서관 선택(지도 이동)까지 같이 일어나지 않게 한다
const stop = (e: MouseEvent) => e.stopPropagation()

type Props = { lib: LibraryWithAvailability; active: boolean; onSelect: () => void }

// 도서관 이름이 선택 버튼이고(키보드로도 선택 가능), 항목의 빈 곳을 눌러도 선택된다.
// 버튼 안에는 다른 버튼·링크를 넣을 수 없어서, 주소 복사·전화·홈페이지는 이름 버튼 밖에 둔다.
export default function LibraryItem({ lib, active, onSelect }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'fail'>('idle')
  const copyAddress = async (e: MouseEvent) => {
    stop(e)
    const ok = await copyText(lib.address)
    setCopyState(ok ? 'done' : 'fail')
    setTimeout(() => setCopyState('idle'), 1500)
  }

  return (
    <li id={`lib-${lib.code}`} className={active ? 'lib-item active' : 'lib-item'} onClick={onSelect}>
      <div className="lib-info">
        <button type="button" className="lib-name" aria-pressed={active} onClick={(e) => { stop(e); onSelect() }}>
          {lib.name}
          {lib.distance != null && <span className="distance">{formatDistance(lib.distance)}</span>}
        </button>

        {lib.address && (
          <span className="lib-line lib-addr">
            <span>📍 {lib.address}</span>
            <button type="button" className="copy-btn" onClick={copyAddress} aria-label={`${lib.name} 주소 복사`}>
              {copyState === 'done' ? '복사됨 ✓' : copyState === 'fail' ? '복사 실패' : '복사'}
            </button>
          </span>
        )}
        {lib.tel && (
          <a className="lib-line lib-tel" href={`tel:${lib.tel.replace(/[^\d+]/g, '')}`} onClick={stop}>
            ☎ {lib.tel}
          </a>
        )}
        <OpenState lib={lib} />
        {lib.homepage && (
          <a className="lib-home" href={lib.homepage} target="_blank" rel="noopener noreferrer" onClick={stop}>
            🔗 {lib.homepage.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            {lib.homepageShared && <span className="lib-home-tag"> · {homepageLabel(lib).replace(' 도서관', '')}</span>}
          </a>
        )}
      </div>
      <span className={lib.loanAvailable ? 'badge ok' : 'badge no'}>
        {lib.loanAvailable ? '대출 가능' : '대출 중'}
      </span>
    </li>
  )
}
