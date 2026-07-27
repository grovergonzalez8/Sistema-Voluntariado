import { useIdentity } from '../../modules/identity';
import {
  ProfilePage,
  type ProfileService,
} from '../../modules/volunteer-profile';

interface ProfileRouteProps {
  readonly profileService: ProfileService;
}

export function ProfileRoute({ profileService }: ProfileRouteProps) {
  const { account, user } = useIdentity();

  if (!account || !user) {
    return null;
  }

  return (
    <ProfilePage
      actorId={user.id}
      authorityVersion={account.authorityVersion}
      service={profileService}
    />
  );
}
