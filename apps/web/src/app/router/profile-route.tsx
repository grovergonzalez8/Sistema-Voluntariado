import { useIdentity } from '../../modules/identity';
import {
  ProfilePage,
  type ProfileService,
} from '../../modules/volunteer-profile';

interface ProfileRouteProps {
  readonly profileService: ProfileService;
}

export function ProfileRoute({ profileService }: ProfileRouteProps) {
  const { user } = useIdentity();

  if (!user) {
    return null;
  }

  return <ProfilePage actorId={user.id} service={profileService} />;
}
