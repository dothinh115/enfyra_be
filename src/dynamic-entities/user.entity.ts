import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("user")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({type:'varchar', nullable: false, default: null})
  email: string;

  @Column({type:'varchar', nullable: false, default: null})
  password: string;

  @Column({type:'boolean', nullable: false, default: false})
  isRootUser: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}