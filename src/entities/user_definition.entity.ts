import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("user_definition")
export class User_definition {
  @Column({ type: "boolean", nullable: false, default: false })
  isRootUser: boolean;

  @Column({ type: "varchar", nullable: false })
  password: string;

  @Column({ type: "varchar", nullable: false })
  email: string;

  @PrimaryGeneratedColumn()
  id: string;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}