import { DonationMongooseDocument } from '../models/donations.model';
import { Admin } from 'mongodb';
import { PledgeAdminMongooseDocument } from '../models/pledgeAdmins.model';

export interface EventReturnValues {
  from: string,
  to: string,
  0: string,
  1: string,
  idProject: string,
  idDelegate: string,
  url: string
  amount?: string
}

export interface EventInterface {
  // address: string,
  blockNumber: number,
  transactionHash: string,
  // transactionIndex: number,
  // blockHash: string,
  logIndex: number,
  // removed: boolean,
  id?: string,
  returnValues: EventReturnValues,
  event: string,
}


export interface PledgeInterface {
  delegates: { id: string } [],
  owner: string,
  token: string,
  intendedProject: string,
  commmitTime: string,
  oldPledge: string,
  pledgeState: string,
  amount?: string
}

export interface AdminInterface {
  type: string,
  addr: string,
  name: string,
  url: string,
  commitTime: string,
  plugin: string
  parentProject: string,
  canceled: boolean,

  isCanceled?: boolean,

}

export interface DelegateInfoInterface {
  delegateId: string,
  delegateTypeId: string,
  delegateType: string,
  intendedProjectType: string,
  intendedProjectTypeId: string,
  intendedProjectId: string,
}


export interface extendedDonation extends DonationMongooseDocument {
  savedStatus?: string,
  savedAmountRemaining?: string,
}


export interface DonationListObjectInterface {
  [key: string]: extendedDonation[]
}

export interface DonationObjectInterface {
  [key: string]: extendedDonation
}

export interface TransferInfoInterface {
  fromPledge: PledgeInterface,
  fromPledgeAdmin: PledgeAdminMongooseDocument,
  toPledgeId: string,
  txHash: string,
  fromPledgeId: string
}

export interface ProjectInterface {
  plugin: string,
  url: string,
  name: string,
  commitTime: string
}

export interface ReportInterface {
  syncDelegatesSpentTime: number,
  syncProjectsSpentTime: number,
  syncDonationsSpentTime: number,
  createdDacs: number,
  createdCampaigns: number,
  createdMilestones: number,
  createdDonations: number,
  createdPledgeAdmins: number,
  processedEvents: number,
  correctFailedDonations: number,
}
