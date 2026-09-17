import ScheduleSheet from './ScheduleSheet';

export default function MaintenanceSchedule() {
  return (
    <ScheduleSheet
      apiBase="maintenance-schedule"
      tabKey="preventive-maintenance-schedule"
      formTitle="Preventive Maintenance Schedule (PMS)"
      dateNoun="Maintenance"
      code="F-LAB-002"
    />
  );
}
