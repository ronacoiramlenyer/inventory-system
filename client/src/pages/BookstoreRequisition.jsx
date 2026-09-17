import RequisitionSlip from './RequisitionSlip';

export default function BookstoreRequisition() {
  return (
    <RequisitionSlip
      apiBase="bookstore-requisitions"
      tabKey="bookstore"
      formTitle="Bookstore Requisition Slip"
    />
  );
}
