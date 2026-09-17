import RequisitionSlip from './RequisitionSlip';

export default function SuppliesRequisition() {
  return (
    <RequisitionSlip
      apiBase="supplies-requisitions"
      tabKey="supplies"
      formTitle="Supplies Requisition Slip"
    />
  );
}
