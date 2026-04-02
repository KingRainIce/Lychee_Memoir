import { useState } from 'react'
import { campuses, defaultCampusId } from '../data/campuses'
import { markCampusOnboardingDone } from '../lib/campusOnboarding'

type FirstCampusWizardProps = {
  onDone: (campusId: string) => void
}

export function FirstCampusWizard({ onDone }: FirstCampusWizardProps) {
  const [id, setId] = useState(defaultCampusId)

  const confirm = () => {
    markCampusOnboardingDone()
    onDone(id)
  }

  return (
    <div className="campus-wizard" role="dialog" aria-modal="true" aria-labelledby="campus-wizard-title">
      <div className="campus-wizard__card">
        <h1 id="campus-wizard-title" className="campus-wizard__title">
          选择校区
        </h1>
        <p className="campus-wizard__desc">首次使用须选定校区；选择会保存在本机浏览器，之后可在顶栏切换。</p>
        <label className="campus-wizard__field">
          <span className="campus-wizard__label">校区</span>
          <select className="campus-wizard__select" value={id} onChange={(e) => setId(e.target.value)}>
            {Object.keys(campuses).map((k) => (
              <option key={k} value={k}>
                {campuses[k].name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="campus-wizard__submit" onClick={confirm}>
          进入深大记忆
        </button>
      </div>
    </div>
  )
}
