import { initials } from '../lib/constants'
import type { Profile } from '../lib/types'

export function Avatar({
  profile,
  size = 32,
}: {
  profile: Pick<Profile, 'full_name' | 'avatar_color'> | null | undefined
  size?: number
}) {
  return (
    <span
      className="avatar"
      title={profile?.full_name ?? 'Sin asignar'}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: profile?.avatar_color ?? '#9aa0b4',
      }}
    >
      {initials(profile?.full_name)}
    </span>
  )
}
