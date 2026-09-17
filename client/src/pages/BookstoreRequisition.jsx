import RequisitionSlip from './RequisitionSlip';

export default function BookstoreRequisition() {
  return (
    <RequisitionSlip
      apiBase="bookstore-requisitions"
      tabKey="bookstore-requisition"
      formTitle="Bookstore Requisition Slip"
    />
  );
}
