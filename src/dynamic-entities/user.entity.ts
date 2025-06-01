import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
@Entity("user")
export class User {
  @Column({type:'boolean', nullable: false, default: false})
  isRootUser: boolean;

  @Column({type:'varchar', nullable: false, default: null})
  password: string;

  @Column({type:'varchar', nullable: false, default: null})
  email: string;

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}