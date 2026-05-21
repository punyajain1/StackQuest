import { useCallback } from 'react';
import { useSQAuth } from '../sqAuth';

export const useUser = () => {
	const { user, isReady } = useSQAuth();
	const fetchUser = useCallback(async () => {
		return user;
	}, [user]);
	return { user, data: user, loading: !isReady, refetch: fetchUser };
};
export default useUser;
