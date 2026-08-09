export interface Hospital {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Patient {
  id: string;
  user_id: string;
  hospital_id: string;
  unique_id: string;
  patient_name: string;
  age: number | null;
  sex: 'male' | 'female' | 'other' | null;
  mobile_number: string | null;
  fees: number;
  prescription: string;
  admission_date: string | null;
  discharge_date: string | null;
  follow_up_date: string | null;
  surgery_date: string | null;
  patient_type: 'op' | 'ip' | null;
  diagnosis: string | null;
  minor_procedure_done: boolean;
  treatment_type: 'surgical' | 'non_surgical' | null;
  discharge_advice: string;
  discharge_summary_path: string | null;
  treatment_photo_paths: string[];
  created_at: string;
  hospital?: Hospital;
}

export interface Attendance {
  id: string;
  user_id: string;
  hospital_id: string;
  attendance_date: string;
  status: 'present' | 'leave' | 'extra_duty';
  leave_type: string | null;
  extra_duty_type: string | null;
  notes: string;
  created_at: string;
  hospital?: Hospital;
}

export interface Surgery {
  id: string;
  patient_id: string;
  user_id: string;
  procedure_name: string;
  surgery_type: string;
  anaesthesia_type: string;
  procedure_notes: string;
  surgery_date: string | null;
  image_paths: string[];
  consent_image_paths: string[];
  role: 'done_by_me' | 'assisted_by_me' | null;
  created_at: string;
}

export interface ConsentProforma {
  id: string;
  procedure_name: string;
  language: string;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUp {
  id: string;
  patient_id: string;
  user_id: string;
  type: 'fnac' | 'biopsy' | null;
  report_number: string;
  lab: string;
  year: number | null;
  findings: string;
  report_image_paths: string[];
  created_at: string;
}

export interface Payment {
  id: string;
  patient_id: string;
  user_id: string;
  hospital_id: string;
  amount: number;
  payment_date: string;
  notes: string;
  created_at: string;
  patient?: Patient;
}

export interface MonthlyEntry {
  id: string;
  user_id: string;
  hospital_id: string;
  month: string;
  entry_date: string | null;
  op_patients: number;
  ip_patients: number;
  opinion_patients: number;
  fees_generated: number;
  fees_received: number;
  notes: string;
  created_at: string;
  hospital?: Hospital;
}

export interface SurgeryType {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Investigation {
  id: string;
  user_id: string;
  patient_id: string;
  investigation_name: string;
  investigation_date: string | null;
  value: string;
  notes: string;
  created_at: string;
}

export interface HospitalRevenue {
  hospital: Hospital;
  totalFees: number;
  totalReceived: number;
  totalPending: number;
  patientCount: number;
}

export interface Collaborator {
  id: string;
  owner_user_id: string;
  invited_email: string;
  invited_user_id: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'declined';
  created_at: string;
  responded_at: string | null;
}

export interface ClassEntry {
  id: string;
  user_id: string;
  hospital_id: string | null;
  class_date: string | null;
  class_type: string;
  audience: string;
  topic: string;
  ppt_path: string | null;
  notes: string;
  created_at: string;
  hospital?: Hospital;
}

export interface Publication {
  id: string;
  user_id: string;
  publication_type: string;
  topic: string;
  author_details: string;
  month: number | null;
  year: number | null;
  platform: string;
  file_path: string | null;
  notes: string;
  created_at: string;
}
