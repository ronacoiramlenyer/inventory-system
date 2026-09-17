import ScheduleSheet from './ScheduleSheet';

export default function CalibrationSchedule() {
  return (
    <ScheduleSheet
      apiBase="calibration-schedule"
      tabKey="equipment-calibration-schedule"
      formTitle="Equipment Calibration Schedule (ECS)"
      dateNoun="Calibration"
      code="F-LAB-003"
    />
  );
}
