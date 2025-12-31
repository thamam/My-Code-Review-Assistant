/**
 * src/modules/navigation/hooks.ts
 * React Hook for consuming the Navigation Module.
 */

import { useEffect, useState } from 'react';
import { navigationService } from './NavigationService';
import { NavigationState } from './types';

export function useNavigationModule() {
    const [state, setState] = useState<NavigationState>(navigationService.getState());

    useEffect(() => {
        const unsubscribe = navigationService.subscribe(setState);
        return unsubscribe;
    }, []);

    return {
        ...state,
        service: navigationService
    };
}
