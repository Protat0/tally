'use client';

import BottomSheet from './BottomSheet';
import ElectricSection from './ElectricSection';

interface Props {
  onClose: () => void;
}

// ElectricSection carries its own hero, rate field and appliance list, plus its
// own ticker — which therefore only runs while this sheet is mounted.
export default function ElectricSheet({ onClose }: Props) {
  return (
    <BottomSheet onClose={onClose}>
      <ElectricSection />
    </BottomSheet>
  );
}
